import type { Metadata, Viewport } from 'next';
import './globals.css';
import SceneCurtain from './SceneCurtain';

export const metadata: Metadata = {
  title: 'STARSONG｜恋歌',
  description: '属于你自己的乙女游戏',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'STARSONG',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0a0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 首屏先把壁纸和大厅状态挂到 html 上，避免切回大厅时重排、闪动 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var w=localStorage.getItem("sl.wallpaper");if(w){document.documentElement.style.setProperty("--wall","url(\\""+w+"\\")")}}catch(e){}',
          }}
        />
        <SceneCurtain />
        {children}
      </body>
    </html>
  );
}
