import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="w-full p-8 flex flex-col items-center justify-center bg-slate-800/50 border border-red-500/30 rounded-xl text-center space-y-4">
                    <div className="p-3 bg-red-900/20 rounded-full">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-200">Something went wrong</h2>
                        <p className="text-slate-400 mt-1 max-w-md mx-auto text-sm">
                            We couldn't render this section. It might be due to unexpected data from Wikipedia.
                        </p>
                    </div>
                    {this.state.error && (
                        <div className="text-xs font-mono bg-slate-950 p-3 rounded-lg text-red-300 max-w-full overflow-auto text-left">
                            {this.state.error.message}
                        </div>
                    )}
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
