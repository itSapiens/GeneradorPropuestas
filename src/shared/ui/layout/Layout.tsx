import React from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-white text-brand-navy font-sans selection:bg-brand-mint/20">
      <main className="container mx-auto px-4 pt-20 pb-12">{children}</main>
    </div>
  );
}
