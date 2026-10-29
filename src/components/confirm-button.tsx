"use client";

import type { ComponentProps } from "react";
import { Button } from "./ui";

/** Submit button that asks the browser for confirmation before its form submits. */
export function ConfirmButton({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
