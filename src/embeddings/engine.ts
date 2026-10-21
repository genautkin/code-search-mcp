import { pipeline, env } from '@huggingface/transformers';

// Configure transformers to use local cache and suppress noisy logs
env.allowLocalModels = true;
env.allowRemoteModels = true;

export class EmbeddingEngine {
  private static instance: EmbeddingEngine | null = null;
  private modelName: string;
  private extractorPromise: Promise<any> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs = 2 * 60 * 1000; // Auto-release ONNX after 2 min idle

  private constructor(modelName: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
  }

  public static getInstance(modelName?: string): EmbeddingEngine {
    if (!EmbeddingEngine.instance || (modelName && EmbeddingEngine.instance.modelName !== modelName)) {
      EmbeddingEngine.instance = new EmbeddingEngine(modelName);
    }
    return EmbeddingEngine.instance;
  }

  private scheduleIdleUnload() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(async () => {
      this.idleTimer = null;
      const currentPromise = this.extractorPromise;
      this.extractorPromise = null;
      if (currentPromise) {
        try {
          const extractor = await currentPromise;
          await extractor?.dispose?.();
        } catch {}
      }
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  private async getExtractor() {
    this.scheduleIdleUnload();
    if (!this.extractorPromise) {
      const configuredThreads = Number(process.env.CODE_SEARCH_THREADS) || 2;
      this.extractorPromise = pipeline('feature-extraction', this.modelName, {
        dtype: 'q8',
        session_options: {
          intraOpNumThreads: configuredThreads,
          interOpNumThreads: 1,
          executionMode: 'sequential'
        }
      });
    }
    return this.extractorPromise;
  }

  public async embedText(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const cleanText = text.replace(/\r?\n/g, ' ').slice(0, 2048); // max token safety
    const output = await extractor(cleanText, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  public async embedBatch(
    texts: string[],
    batchSize = 16,
    interSliceDelayMs = 0
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const results: number[][] = new Array(texts.length);

    // Clean and sort by length ascending so sequences within each micro-batch
    // have homogeneous token lengths (eliminates 2x-4x Transformer padding waste)
    const indexed = texts.map((t, idx) => ({
      idx,
      clean: t.replace(/\r?\n/g, ' ').slice(0, 2048)
    }));
    indexed.sort((a, b) => a.clean.length - b.clean.length);

    for (let i = 0; i < indexed.length; i += batchSize) {
      const sliceItems = indexed.slice(i, i + batchSize);
      const batch = sliceItems.map((item) => item.clean);

      const output = await extractor(batch, {
        pooling: 'mean',
        normalize: true
      });

      const batchDim = output.dims ? output.dims[1] : Math.round(output.data.length / batch.length);
      for (let j = 0; j < sliceItems.length; j++) {
        const vector = Array.from(output.data.slice(j * batchDim, (j + 1) * batchDim)) as number[];
        results[sliceItems[j].idx] = vector;
      }

      // Yield cooperatively to the Node.js event loop (and optionally pause in gentle mode)
      if (i + batchSize < indexed.length) {
        if (interSliceDelayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, interSliceDelayMs));
        } else {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    }

    return results;
  }
}
