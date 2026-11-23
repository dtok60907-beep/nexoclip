"use client";
import { GlassSidebar,GlassSidebarGroup,GlassSidebarHeader,GlassSidebarItem,GlassSidebarToggle } from "./glass-sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home01Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
export default function GlassSidebarDemo(){
 const [active,setActive]=useState("Home");
 return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-100 via-white to-violet-100"><GlassSidebar style={{height:420}}>
 <GlassSidebarHeader><GlassSidebarToggle/></GlassSidebarHeader><GlassSidebarGroup label="Library">
 <GlassSidebarItem icon={<HugeiconsIcon icon={Home01Icon}/>} active={active==="Home"} onClick={()=>setActive("Home")}>Home</GlassSidebarItem>
 <GlassSidebarItem icon={<HugeiconsIcon icon={InboxIcon}/>} badge={4} active={active==="Inbox"} onClick={()=>setActive("Inbox")}>Inbox</GlassSidebarItem>
 </GlassSidebarGroup></GlassSidebar></div>;
}
