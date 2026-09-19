import { useRef } from "react";
import { Dialog, Flex } from "@radix-ui/themes";

import { Button } from "./primitives";

export function VoteDialog({
  choice,
  onClose,
  onConfirm,
}: {
  choice: boolean | null;
  onClose: () => void;
  onConfirm: (choice: boolean) => void;
}) {
  const previous = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      open={choice !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content
        maxWidth="440px"
        className="vote-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          previous.current = document.activeElement as HTMLElement | null;
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          previous.current?.focus();
        }}
      >
        <Dialog.Title>确认你的判断</Dialog.Title>
        <Dialog.Description size="3">
          你选择了「{choice ? "构成违约" : "不构成违约"}」。
          <br />
          投票后不能修改；本次操作为模拟投票。
        </Dialog.Description>
        <Flex gap="3" mt="6" justify="end">
          <Dialog.Close>
            <Button ref={cancel} secondary size="3">
              再想一下
            </Button>
          </Dialog.Close>
          <Button
            size="3"
            onClick={() => {
              if (choice !== null) onConfirm(choice);
            }}
          >
            确认投票
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
