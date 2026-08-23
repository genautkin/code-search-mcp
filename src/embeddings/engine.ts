import { pipeline, env } from '@huggingface/transformers';

// Configure transformers to use local cache and suppress noisy logs
env.allowLocalModels = true;
env.allowRemoteModels = true;

export class EmbeddingEngine {
  private static instance: EmbeddingEngine | null = null;
  private modelName: string;
  private extractorPromise: Promise<any> | null = null;

  private constructor(modelName: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
  }

  public static getInstance(modelName?: string): EmbeddingEngine {
    if (!EmbeddingEngine.instance || (modelName && EmbeddingEngine.instance.modelName !== modelName)) {
      EmbeddingEngine.instance = new EmbeddingEngine(modelName);
    }
    return EmbeddingEngine.instance;
  }

  private async getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline('feature-extraction', this.modelName, {
        dtype: 'fp32'
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

  public async embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const results: number[][] = [];
    const dim = 384;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) =>
        t.replace(/\r?\n/g, ' ').slice(0, 2048)
      );
      const output = await extractor(batch, {
        pooling: 'mean',
        normalize: true
      });

      for (let j = 0; j < batch.length; j++) {
        const slice = Array.from(output.data.slice(j * dim, (j + 1) * dim)) as number[];
        results.push(slice);
      }
    }

    return results;
  }
}
