import type { Metadata, Viewport } from 'next';
import './globals.css';

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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 首屏先把壁纸挂到 html 上，避免大厅加载后再铺图造成闪动 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var w=localStorage.getItem("sl.wallpaper");if(w){document.documentElement.style.setProperty("--wall","url(\\""+w+"\\")")}}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
