import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const sans=Geist({subsets:["latin"],variable:"--geist-sans"});
const mono=Geist_Mono({subsets:["latin"],variable:"--geist-mono"});
export const metadata: Metadata={title:"Sema — Weekly planner",description:"Plan a balanced week with clear, evidence-informed guidance."};
export const viewport: Viewport={themeColor:"#111412",width:"device-width",initialScale:1,userScalable:true};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="bg-background"><body className={`${sans.variable} ${mono.variable} font-sans`}>{children}</body></html>}
