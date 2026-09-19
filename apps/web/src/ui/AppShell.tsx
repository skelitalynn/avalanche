import type { ReactNode } from "react";
import { Badge, TabNav } from "@radix-ui/themes";
import {
  ArrowUpRight,
  Heart,
  House,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import type { Page, Stage } from "../data/types";
import { Avatar } from "./primitives";

const nav = [
  { page: "relationship", label: "我们的关系", icon: Heart },
  { page: "invite", label: "共同的约定" },
  { page: "dispute", label: "确认与申诉", icon: ShieldCheck },
  { page: "jury", label: "好友监督", icon: UsersThree },
  { page: "ended", label: "关系结算" },
];
const journey = [
  "填写约定",
  "资金与好友",
  "双方签署",
  "存入资金",
  "关系已建立",
];
export function AppShell({
  page,
  stage,
  roleName,
  children,
}: {
  page: Page;
  stage: Stage;
  roleName: string;
  children: ReactNode;
}) {
  const journeyStep =
    page === "create"
      ? 0
      : page === "invite"
        ? stage === "invited"
          ? 2
          : stage === "funding"
            ? 3
            : 4
        : 4;
  return (
    <div className={`app ${page === "home" ? "landing-app" : ""}`}>
      <a
        className="skip-link"
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      <header className="topbar">
        <a className="wordmark" href="#/home" aria-label="SituationSHIT 首页">
          Situation<span>SHIT</span>
          <ArrowUpRight size={16} />
        </a>
        <div className="top-actions">
          <span className="account">
            <Avatar name={roleName} small />
            {roleName}
          </span>
          <Badge className="demo-badge" color="lime" variant="soft">
            演示模式 · 模拟数据
          </Badge>
        </div>
      </header>
      {page !== "home" && (
        <>
          <TabNav.Root className="desktop-nav" aria-label="主要导航" size="2">
            {nav.map((item) => (
              <TabNav.Link
                key={item.page}
                href={`#/${item.page}`}
                active={page === item.page}
              >
                {item.label}
              </TabNav.Link>
            ))}
            <TabNav.Link href="#/create" active={page === "create"}>
              开始一段关系 <ArrowUpRight />
            </TabNav.Link>
          </TabNav.Root>
          <nav className="journey" aria-label="建立关系进度">
            <ol>
              {journey.map((label, index) => (
                <li
                  key={label}
                  className={
                    index === journeyStep
                      ? "current"
                      : index < journeyStep
                        ? "complete"
                        : ""
                  }
                  aria-current={index === journeyStep ? "step" : undefined}
                >
                  <span>{index < journeyStep ? "✓" : index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </nav>
        </>
      )}
      <main id="content" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <span>
          SituationSHIT <span>· 让认真有迹可循</span>
        </span>
        <span>Made for two. Backed by Avalanche.</span>
      </footer>
      <nav className="mobile-nav" aria-label="移动导航">
        <a href="#/home" aria-current={page === "home" ? "page" : undefined}>
          <House />
          首页
        </a>
        {nav
          .filter((item) => item.icon)
          .map(({ page: target, label, icon: Icon }) => (
            <a
              key={target}
              href={`#/${target}`}
              aria-current={page === target ? "page" : undefined}
            >
              {Icon && <Icon />}
              {label}
            </a>
          ))}
      </nav>
    </div>
  );
}
