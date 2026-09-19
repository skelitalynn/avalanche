import type { ComponentProps, ReactNode } from "react";
import {
  Avatar as RadixAvatar,
  Badge,
  Button as RadixButton,
} from "@radix-ui/themes";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react";
import type { Page } from "../data/types";
import { go } from "./presentation";

export function Button({
  secondary = false,
  className = "",
  type = "button",
  ...props
}: ComponentProps<typeof RadixButton> & { secondary?: boolean }) {
  return (
    <RadixButton
      size="3"
      variant={secondary ? "outline" : "solid"}
      type={type}
      className={`button ${secondary ? "secondary" : ""} ${className}`}
      {...props}
    />
  );
}
export function Pill({
  children,
  green = false,
}: {
  children: ReactNode;
  green?: boolean;
}) {
  return (
    <Badge
      className="pill"
      color={green ? "lime" : "gray"}
      variant="soft"
      size="2"
    >
      <span className="dot" />
      {children}
    </Badge>
  );
}
export function Avatar({
  name,
  second = false,
  small = false,
}: {
  name: string;
  second?: boolean;
  small?: boolean;
}) {
  return (
    <RadixAvatar
      className="avatar"
      fallback={name.slice(-1)}
      title={name}
      color={second ? "gray" : "grass"}
      size={small ? "2" : "4"}
      radius="full"
    />
  );
}
export function Empty({
  title,
  children,
  target = "relationship",
}: {
  title: string;
  children: ReactNode;
  target?: Page;
}) {
  return (
    <section className="empty">
      <ShieldCheck size={36} weight="light" />
      <h2>{title}</h2>
      <p>{children}</p>
      <Button onClick={() => go(target)}>
        查看关系 <ArrowRight />
      </Button>
    </section>
  );
}
