import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('GENESIS crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center bg-ink-950 p-6 text-ink-100">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-ink-850 p-6 text-center shadow-2xl">
          <div className="font-display text-xl font-bold tracking-[0.25em] text-gold-300">GENESIS</div>
          <h1 className="mt-3 text-lg font-semibold">Something went wrong in this world.</h1>
          <p className="mt-2 text-sm text-ink-300">{this.state.error.message}</p>
          <p className="mt-2 text-xs text-ink-400">Your saved worlds are safe in this browser. Reload to start again.</p>
          <button type="button" className="btn btn-gold mt-5" onClick={() => window.location.reload()}>
            Reload GENESIS
          </button>
        </div>
      </div>
    );
  }
}
