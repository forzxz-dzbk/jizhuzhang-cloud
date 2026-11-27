import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Prevent a component render exception from leaving Safari on a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Do not print session data or backend responses to the browser console.
  }

  render() {
    if (this.state.failed) {
      return <main className="fatal-error" role="alert">
        <h1>页面加载遇到问题</h1>
        <p>登录状态已保留。请刷新页面重试；如果仍出现此提示，请联系项目维护者并说明使用的浏览器版本。</p>
        <button onClick={() => window.location.reload()}>刷新页面</button>
      </main>;
    }
    return this.props.children;
  }
}
