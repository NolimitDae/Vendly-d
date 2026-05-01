"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HiOutlineMenu, HiX } from "react-icons/hi";
import Image from "next/image";
import { LogOut, LayoutDashboard, ShoppingBag, Calendar, BookOpen, Store, Bookmark, Bell, Check, MessageSquare, Wallet, TrendingUp, CreditCard, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import Container from "@/app/_components/Container";
import { ThemeToggle } from "@/components/landing-page/theme/ThemeToggle";
import { CookieHelper } from "@/helper/cookie.helper";
import { AuthService } from "@/service/auth/auth.service";
import { useNotifications } from "@/hooks/useNotifications";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const homeItems = [
  { en: "Home", href: "/", hash: "home" },
  { en: "About Us", href: "/#about", hash: "about" },
  { en: "How It Works", href: "/#how-it-works", hash: "how-it-works" },
  { en: "Services", href: "/#services", hash: "services" },
] as const;

const appLinks = [
  { en: "Marketplace", href: "/marketplace", icon: Store },
  { en: "Event Planners", href: "/event-planner", icon: Calendar },
] as const;

function scrollToSection(hash: string) {
  if (hash === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.replaceState(null, "", "/");
    return;
  }
  const el = document.getElementById(hash);
  el?.scrollIntoView({ behavior: "smooth" });
  window.history.replaceState(null, "", `/#${hash}`);
}

interface UserInfo {
  id: string;
  name: string;
  type: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const { notifications, unread, markAsRead, markAllAsRead } = useNotifications();

  useEffect(() => {
    const update = () =>
      setHash(typeof window !== "undefined" ? window.location.hash : "");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    const token = CookieHelper.get({ key: "token" });
    if (token) {
      AuthService.me()
        .then((res) => {
          if (res.data?.success) setUser(res.data.data);
        })
        .catch(() => {});
    }
  }, [pathname]);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    itemHash: string,
  ) => {
    if (pathname !== "/") return;
    e.preventDefault();
    scrollToSection(itemHash);
    setHash(itemHash === "home" ? "" : `#${itemHash}`);
    setMenuOpen(false);
  };

  const linkIsActive = (itemHash: string) => {
    if (pathname !== "/") return false;
    if (itemHash === "home") return hash === "" || hash === "#" || hash === "#home";
    return hash === `#${itemHash}`;
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
    } catch {}
    CookieHelper.destroy({ key: "token" });
    setUser(null);
    setUserMenuOpen(false);
    router.push("/");
  };

  const dashboardHref = () => {
    if (!user) return "/login";
    if (user.type === "ADMIN") return "/dashboard";
    if (user.type === "VENDOR") return "/vendor/listings";
    if (user.type === "EVENT_PLANNER") return "/event-planner/profile";
    return "/bookings";
  };

  return (
    <Container className="mt-4 relative z-50">
      <div className={cn("flex justify-between items-center p-3 md:p-4 rounded-full nav_container")}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <Image
            src="/site_logo.png"
            alt="logo"
            width={50}
            height={50}
            className="w-8 h-8 md:w-12 md:h-12"
          />
          <span className="bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-lg md:text-2xl font-bold">
            Vendly
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-6 text-base">
          {homeItems.map((item) => (
            <Link
              key={item.hash}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.hash)}
              className={cn(
                "hover:text-purpleColor transition text-base dark:text-white",
                linkIsActive(item.hash)
                  ? "text-blackColor dark:text-white font-medium"
                  : "text-descriptionColor",
              )}
            >
              {item.en}
            </Link>
          ))}
          <span className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
          {appLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "hover:text-purpleColor transition text-base dark:text-white flex items-center gap-1.5",
                pathname.startsWith(item.href)
                  ? "text-primary font-medium"
                  : "text-descriptionColor",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.en}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="hidden lg:flex items-center gap-3">
          <ThemeToggle />

          {user ? (
            <>
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => { setBellOpen((o) => !o); setUserMenuOpen(false); }}
                className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">
                      Notifications
                    </span>
                    {unread > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="flex items-center gap-1 text-xs text-primary hover:opacity-80 transition font-medium"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-sm text-gray-400">
                        <Bell className="w-7 h-7 mx-auto mb-2 opacity-30" />
                        No notifications yet
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { if (!n.read_at) markAsRead(n.id); }}
                          className={cn(
                            "w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-start gap-3",
                            !n.read_at && "bg-primary/5 dark:bg-primary/10",
                          )}
                        >
                          {/* Sender avatar */}
                          {n.sender?.avatar ? (
                            <Image
                              src={n.sender.avatar}
                              alt={n.sender.name}
                              width={32}
                              height={32}
                              className="rounded-full w-8 h-8 object-cover flex-shrink-0 mt-0.5"
                              unoptimized
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                              {n.sender?.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug line-clamp-2">
                              {n.notification_event?.text ?? "New notification"}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {dayjs(n.created_at).fromNow()}
                            </p>
                          </div>
                          {!n.read_at && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </button>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2.5 text-center">
                    <Link
                      href="/notifications"
                      onClick={() => setBellOpen(false)}
                      className="text-xs font-medium text-primary hover:opacity-80 transition"
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                  {user.name?.[0]?.toUpperCase() ?? "U"}
                </div>
                {user.name?.split(" ")[0]}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50">
                  <Link
                    href={dashboardHref()}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  {user.type === "VENDOR" && (
                    <>
                      <Link
                        href="/vendor/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My Profile
                      </Link>
                      <Link
                        href="/vendor/bookings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <BookOpen className="w-4 h-4" />
                        My Bookings
                      </Link>
                      <Link
                        href="/vendor/earnings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Earnings
                      </Link>
                      <Link
                        href="/vendor/subscription"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <CreditCard className="w-4 h-4" />
                        Subscription
                      </Link>
                    </>
                  )}
                  {user.type === "EVENT_PLANNER" && (
                    <>
                      <Link
                        href="/event-planner/events"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <Calendar className="w-4 h-4" />
                        My Events
                      </Link>
                      <Link
                        href="/event-planner/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My Profile
                      </Link>
                    </>
                  )}
                  {(user.type === "CLIENT" || user.type === "CUSTOMER") && (
                    <>
                      <Link
                        href="/bookings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        My Bookings
                      </Link>
                      <Link
                        href="/saved-listings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        <Bookmark className="w-4 h-4" />
                        Saved Listings
                      </Link>
                    </>
                  )}
                  {(user.type === "CLIENT" || user.type === "CUSTOMER" || user.type === "VENDOR") && (
                    <Link
                      href="/wallet"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      <Wallet className="w-4 h-4" />
                      Wallet
                    </Link>
                  )}
                  <Link
                    href="/chat"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Messages
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                  <hr className="my-1 border-gray-100 dark:border-gray-700" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-5 py-2.5 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="gradient-bg text-white font-medium px-6 py-2.5 rounded-full text-sm hover:opacity-90 transition"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-2xl cursor-pointer"
          >
            {menuOpen ? (
              <HiX className="text-violet-500" />
            ) : (
              <HiOutlineMenu className="text-violet-500" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "lg:hidden fixed top-0 right-0 w-full bg-blackColor/20 backdrop-blur-xs h-screen z-50 transform transition-transform duration-300 ease-in-out",
          menuOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="w-[80%] absolute top-0 p-4 right-0 h-full max-w-[320px] bg-white dark:bg-gray-900 overflow-y-auto">
          <div className="flex w-full justify-between items-center mb-4">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/site_logo.png" alt="logo" width={40} height={40} />
              <span className="bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree bg-clip-text text-transparent text-lg font-bold">
                Vendly
              </span>
            </Link>
            <button
              aria-label="close-menu"
              className="text-violet-500"
              onClick={() => setMenuOpen(false)}
            >
              <HiX className="text-2xl" />
            </button>
          </div>

          <div className="space-y-1">
            {homeItems.map((item) => (
              <Link
                key={item.hash}
                href={item.href}
                className={cn(
                  "block text-sm py-2.5 px-3 rounded-xl dark:text-white",
                  linkIsActive(item.hash)
                    ? "text-primary font-medium bg-primary/5"
                    : "text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
                onClick={(e) => {
                  handleNavClick(e, item.hash);
                  setMenuOpen(false);
                }}
              >
                {item.en}
              </Link>
            ))}

            <div className="pt-2 pb-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-3 mb-1">
                Explore
              </p>
              {appLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl",
                    pathname.startsWith(item.href)
                      ? "text-primary font-medium bg-primary/5"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.en}
                </Link>
              ))}
            </div>

            {user ? (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-3 mb-1">
                  Account
                </p>
                <Link
                  href={dashboardHref()}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                {user.type === "VENDOR" && (
                  <>
                    <Link
                      href="/vendor/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      My Profile
                    </Link>
                    <Link
                      href="/vendor/earnings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Earnings
                    </Link>
                    <Link
                      href="/vendor/subscription"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <CreditCard className="w-4 h-4" />
                      Subscription
                    </Link>
                  </>
                )}
                {user.type === "EVENT_PLANNER" && (
                  <Link
                    href="/event-planner/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    My Profile
                  </Link>
                )}
                <Link
                  href={user.type === "CLIENT" || user.type === "CUSTOMER" ? "/bookings" : "/vendor/bookings"}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ShoppingBag className="w-4 h-4" />
                  My Bookings
                </Link>
                {(user.type === "CLIENT" || user.type === "CUSTOMER") && (
                  <Link
                    href="/saved-listings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Bookmark className="w-4 h-4" />
                    Saved Listings
                  </Link>
                )}
                {(user.type === "CLIENT" || user.type === "CUSTOMER" || user.type === "VENDOR") && (
                  <Link
                    href="/wallet"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Wallet className="w-4 h-4" />
                    Wallet
                  </Link>
                )}
                <Link
                  href="/chat"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <MessageSquare className="w-4 h-4" />
                  Messages
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
                <Link
                  href="/notifications"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Bell className="w-4 h-4" />
                  Notifications
                  {unread > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                <button
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 text-sm py-2.5 px-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            ) : (
              <div className="pt-4 flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-xl gradient-bg text-white text-sm font-medium"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
