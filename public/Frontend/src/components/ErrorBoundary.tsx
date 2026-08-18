import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

// A crash in ANY part of a React tree normally blanks the WHOLE page white
// with nothing visible to the user and nothing in view unless someone opens
// desktop DevTools — which is exactly what made two real bugs painful to
// diagnose on a phone. This boundary catches that crash and prints the real
// error message + component stack directly on screen instead, so a photo or
// copy-paste of the visible text is enough to fix it, no desktop required.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error(`[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: 20, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ color: '#ff5c5c', fontWeight: 'bold', marginBottom: 10 }}>
            ⚠️ Something crashed{this.props.label ? ` in ${this.props.label}` : ''}.
          </p>
          <p style={{ marginBottom: 10 }}>
            Copy the text below and send it back — this tells us exactly what broke.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#141414', padding: 12, borderRadius: 8, border: '1px solid #333' }}>
            {this.state.error.name}: {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
            {this.state.info?.componentStack ? '\n\n--- component stack ---' + this.state.info.componentStack : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null, info: null })}
            style={{ marginTop: 16, background: '#C6FF3D', color: '#000', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
