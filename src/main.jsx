import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

/* 게임 스크립트 이중 실행 방지: StrictMode 비활성 */
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
