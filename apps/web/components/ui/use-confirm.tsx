"use client";

import { useCallback, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
};

/**
 * Confirmação com o <dialog> do app (no lugar de window.confirm):
 * `const [confirmDialog, confirm] = useConfirm();` e `if (!(await confirm({...}))) return;`
 */
export function useConfirm(): [React.ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <ConfirmDialog
      open={opts !== null}
      title={opts?.title ?? ""}
      description={opts?.description ?? ""}
      confirmLabel={opts?.confirmLabel}
      danger={opts?.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return [dialog, confirm];
}
