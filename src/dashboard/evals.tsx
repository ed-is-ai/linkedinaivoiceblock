import { render } from 'preact';

function App() {
  return <div id="evals-root" />;
}

render(<App />, document.getElementById('root')!);
