import React from "react";
import { Welcome } from "@/components/welcome";
import DemoForm from "@/components/form-fields/demo-form";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 md:p-8">
      <Welcome />
      <DemoForm />
    </div>
  );
}
