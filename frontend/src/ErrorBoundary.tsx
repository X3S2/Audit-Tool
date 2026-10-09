import React, { type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        this.setState({
            hasError: true,
            error,
            errorInfo,
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '4px',
                    color: '#991b1b',
                    fontFamily: 'monospace'
                }}>
                    <h2>Etwas ist schief gelaufen</h2>
                    <p>Wir entschuldigen uns für die Unannehmlichkeit. Bitte versuchen Sie, die Seite zu aktualisieren.</p>
                    {this.state.error && (
                        <details style={{ marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                            <summary>Fehlerdetails</summary>
                            <p>{this.state.error.toString()}</p>
                            {this.state.errorInfo && (
                                <p>{this.state.errorInfo.componentStack}</p>
                            )}
                        </details>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '10px',
                            padding: '8px 16px',
                            backgroundColor: '#991b1b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Seite neu laden
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
