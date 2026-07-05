import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('React Error Boundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-400" size={32} />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-slate-400 text-sm mb-6">
              The app encountered an unexpected error. Your data is safe. Try reloading the page.
            </p>
            {this.state.error && (
              <details className="text-left mb-6 bg-slate-800 rounded-lg p-3">
                <summary className="text-xs text-slate-500 cursor-pointer font-semibold mb-2">
                  Error details
                </summary>
                <pre className="text-[10px] text-red-400 overflow-x-auto whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleReload}
              className="w-full bg-lime-500 text-slate-950 font-black rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-lime-400 transition active:scale-95"
            >
              <RefreshCw size={18} />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
