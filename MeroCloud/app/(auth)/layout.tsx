import React from "react";
import Image from "next/image";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="auth-layout">
      <section className="auth-brand-panel">
        <div className="flex max-h-[800px] max-w-[430px] flex-col justify-center space-y-12">
          <Image
            src="/assets/icons/logo-full.png"
            alt="logo"
            width={224}
            height={82}
            className="h-auto max-w-full object-contain"
          />

          <div className="space-y-5 text-white">
            <h1 className="h1">Manage your files the best way</h1>
            <p className="body-1">
              This is a place where you can store all your documents.
            </p>
          </div>
          <Image
            src="/assets/images/files.png"
            alt="Files"
            width={342}
            height={342}
            className="transition-all hover:rotate-2 hover:scale-105"
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
