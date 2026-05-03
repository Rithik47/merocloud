import React from "react";
import Image from "next/image";

const features = [
  {
    label: "Encrypted & secure",
    desc: "Your files are protected with 256-bit encryption.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: "Access anywhere",
    desc: "Open your workspace from any device, instantly.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    ),
  },
  {
    label: "AI-powered insights",
    desc: "Summarise, search, and understand your files with AI.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        <path d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    ),
  },
];

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="auth-layout">
      <section className="auth-brand-panel">
        <div className="flex max-h-[800px] max-w-[430px] flex-col justify-center space-y-10">
          <Image
            src="/assets/icons/logo-full.png"
            alt="logo"
            width={280}
            height={102}
            className="h-auto max-w-full object-contain drop-shadow-lg"
          />

          <div className="space-y-3 text-white">
            <h1 className="h1">Manage your files the best way</h1>
            <p className="body-1 text-white/70">
              Your personal cloud — secure, smart, and always with you.
            </p>
          </div>

          <div className="space-y-4">
            {features.map(({ label, desc, icon }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-white/60">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Image
            src="/assets/images/files.png"
            alt="Files"
            width={300}
            height={300}
            className="mx-auto animate-float transition-all hover:scale-105"
          />
        </div>
      </section>

      <section className="auth-content-panel">
        <div className="mb-16 lg:hidden">
          <Image
            src="/assets/icons/logo-full-brand.png"
            alt="logo"
            width={224}
            height={82}
            className="h-auto w-[200px] max-w-full object-contain lg:w-[250px]"
          />
        </div>

        {children}
      </section>
    </div>
  );
};

export default Layout;
