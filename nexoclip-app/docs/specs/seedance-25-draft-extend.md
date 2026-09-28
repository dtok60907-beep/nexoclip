# Seedance 2.5 Draft Mode and Extend

## Scope

Add two Canvas capabilities for the direct BytePlus Seedance 2.5 models:

- Draft preview: `480p` with `draft: true`.
- Video extension: one connected source video, `ratio: adaptive`, and `omni_reference_task_type: extend`.

The feature applies to `seedance-2.5` and `seedance-2.5-unfiltered` only.

## API contracts

### Draft

The Canvas submits the normal prompt and references with:

```json
{
  "resolution": "480p",
  "draft": true,
  "aspectRatio": "adaptive"
}
```

BytePlus receives `draft: true`. Draft mode is only valid at 480p.

### Extend

The Canvas requires a connected source video and submits:

```json
{
  "referenceVideos": ["/api/assets/<id>/download"],
  "aspectRatio": "adaptive",
  "omniReferenceTaskType": "extend"
}
```

The provider adapter maps these to `reference_video`, `ratio: adaptive`, and `omni_reference_task_type: extend`.

## Constraints

- Draft is only supported by Seedance 2.5 and only at 480p.
- Draft finalization is only supported at 1080p and must use BytePlus `draft_task` content. The finalization UI is intentionally a follow-up milestone because the provider task ID must be persisted securely server-side.
- Extend requires one source video and Seedance 2.5.
- Seedance 2.5 extend supports durations 4–30 seconds or `-1`; the Canvas currently exposes the configured duration and sends `adaptive` ratio.
- Existing non-Seedance models retain their existing behavior.

## UX

The Video node shows `Draft` and `Extend` controls only for Seedance 2.5 models. Draft and Extend are mutually exclusive. Extend disables draft. Draft forces 480p at submission. Extend forces adaptive ratio and requires a video connection.

## Security

Reference URLs continue to be validated as tenant-owned assets or owned legacy Canvas references. API keys remain server-side.

## Follow-up

Implement a server-side `finalizeDraft(generationId)` action that resolves the stored BytePlus provider task ID and creates a new 1080p generation without resending prompt/assets/settings, as required by BytePlus.
