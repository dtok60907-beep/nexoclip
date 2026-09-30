'use client'

import { Component, memo, type ComponentType, type JSX, type ReactNode } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { reportClientError } from '@/lib/client-error-report'

interface BoundaryProps {
  nodeId: string
  nodeType?: string
  /** When this changes (new node data from an edit or a collaborator), a crashed node retries. */
  resetKey: unknown
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
  resetKey: unknown
}

function sameContent(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

// Without this, a render error in any single node unmounts the whole canvas
// and Next shows its full-page "This page couldn't load" screen. Containing it
// to the node keeps the board usable and shows what actually went wrong.
class NodeErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    // Every canvas update rebuilds every node's data object, so identity
    // changed on any edit anywhere: a crashed node re-rendered, crashed and
    // re-reported on each one. Retry only when this node's data content
    // actually changed (compared only while crashed, so healthy nodes pay
    // nothing).
    if (state.error && sameContent(props.resetKey, state.resetKey)) return { resetKey: props.resetKey }
    return { resetKey: props.resetKey, error: null }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[canvas] node ${this.props.nodeType ?? '?'}:${this.props.nodeId} crashed`, error, info.componentStack)
    reportClientError(error, {
      scope: 'canvas-node',
      nodeId: this.props.nodeId,
      nodeType: this.props.nodeType,
      componentStack: info.componentStack?.slice(0, 4000),
    })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="w-[260px] rounded-xl border border-red-500/40 bg-[#1a1114] p-3 text-xs text-red-200 shadow-lg">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <WarningCircle size={14} weight="bold" />
          This node hit an error
        </div>
        <p className="mb-2 break-words font-mono text-[11px] text-red-300/80">{error.message}</p>
        <button
          type="button"
          className="nodrag rounded-md bg-red-500/20 px-2 py-1 font-medium hover:bg-red-500/30"
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </button>
      </div>
    )
  }
}

export function withNodeErrorBoundary<P extends { id: string; type?: string; data?: unknown }>(Inner: ComponentType<P>) {
  const Wrapped = (props: P) => (
    <NodeErrorBoundary nodeId={props.id} nodeType={props.type} resetKey={props.data}>
      <Inner {...(props as P & JSX.IntrinsicAttributes)} />
    </NodeErrorBoundary>
  )
  Wrapped.displayName = `WithNodeErrorBoundary(${Inner.displayName || Inner.name || 'Node'})`
  return memo(Wrapped) as unknown as ComponentType<P>
}
