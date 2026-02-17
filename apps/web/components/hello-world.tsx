"use client";

import { Button } from "@repo/ui/components/button";
import { useToast } from "@repo/ui/hooks/use-toast";

const HelloWorld = () => {
  const { toast } = useToast();

  // Simplicity - Just a simple button to get the hello world message
  const handleClick = async () => {
    const response = await fetch("http://localhost:3001/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      toast.error("Failed to connect to the backend");
      console.log(response);
    }

    const data = await response.json();
    toast.success(data.message);
  };

  return (
    <div>
      <Button size="lg" onClick={handleClick}>
        Hello World
      </Button>
    </div>
  );
};

export default HelloWorld;
