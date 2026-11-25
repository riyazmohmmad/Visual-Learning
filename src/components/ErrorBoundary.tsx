import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error?.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === 'object' && parsed.error) {
        if (String(parsed.error).toLowerCase().includes('permission')) {
          message = 'You do not have permission to access this resource. Please sign in with the appropriate account.';
        } else {
          message = parsed.error;
        }
      }
    } catch {
      // Non-JSON error message; display as-is
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh w-full bg-[#F8FAFC] flex items-center justify-center p-4 pb-safe-lg font-sans">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 border border-red-100 text-red-600 mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="type-card-title text-slate-900">Something went wrong</h1>
              <p className="type-helper text-slate-600 leading-relaxed">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white type-btn rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload VisuaLearn</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
