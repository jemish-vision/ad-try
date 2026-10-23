import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      (error?.message && error.message.includes('Loading chunk'));
    return { hasError: true, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    // If it's a ChunkLoadError, attempt an automatic refresh once if not refreshed recently
    if (
      error?.name === 'ChunkLoadError' ||
      (error?.message && error.message.includes('Loading chunk'))
    ) {
      const chunkFailed = sessionStorage.getItem('chunk_load_failed');
      if (!chunkFailed) {
        sessionStorage.setItem('chunk_load_failed', 'true');
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    sessionStorage.removeItem('chunk_load_failed');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          <h2>{this.state.isChunkError ? 'Application Update Available' : 'Something went wrong.'}</h2>
          <p style={{ color: '#666', maxWidth: '400px', marginBottom: '20px' }}>
            {this.state.isChunkError
              ? 'A new version of the app or component is available. Please reload the page to load the latest changes.'
              : 'An unexpected error occurred while loading this view.'}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1677ff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
