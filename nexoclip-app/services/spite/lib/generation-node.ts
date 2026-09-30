import { withGenerationOutputBasePath } from './base-path'

export function completeGenerationNode(
  data: Record<string, unknown>,
  outputUrl: string,
): Record<string, unknown> {
  const {
    pendingRequestId: _pendingRequestId,
    pendingProvider: _pendingProvider,
    pendingProviderModel: _pendingProviderModel,
    pendingFalEndpoint: _pendingFalEndpoint,
    pendingStartedAt: _pendingStartedAt,
    ...currentData
  } = data

  // Mirror the server's terminal patch. Leaving generationStatus at
  // 'queued'/'processing' kept the job "running" in the Jobs panel, kept the
  // tab polling it for recovery, and made the next Generate answer 409.
  return {
    ...currentData,
    ...(typeof currentData.generationId === 'string' ? { lastGenerationId: currentData.generationId } : {}),
    generationStatus: 'completed',
    generationError: null,
    status: 'completed',
    outputUrl: withGenerationOutputBasePath(outputUrl),
    error: null,
  }
}
