/* 앱 설치용 최소 서비스 워커.
   아무것도 저장(캐시)하지 않습니다. 페이지 이동(주소 열기)만 네트워크에서 그대로 받아 오고,
   그 밖의 요청(그림, 스크립트, Firebase 로그인·실시간 연결 등)은 손대지 않고 브라우저에 맡깁니다. */
const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연결 없음</title><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1 style="font-size:1.3rem">인터넷에 연결되어 있지 않아요</h1><p>연결을 확인한 뒤 다시 열어 주세요.</p></body>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(
        fetch(event.request).catch(
            () => new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        ),
    );
});
