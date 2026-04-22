import React from "react";
import { Toaster } from "sileo";
import Button from "../ui/Button";
import sapiensLogo from "../../assets/sapiens-logo.png";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white text-brand-navy font-sans selection:bg-brand-mint/20">
      <main className="container mx-auto px-4 pt-20 pb-12">{children}</main>

      <Toaster position="top-center" theme="light" />
    </div>
  );
}
