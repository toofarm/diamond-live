"use client";

import { useState } from "react";
import { TEAMS } from "@/lib/mlb/teams";
import { AppBar, TeamBadge, Wordmark } from "@/components/ui/primitives";
import { IconBell, IconChevron, IconClose, IconMoon, IconSun } from "@/components/ui/icons";
import type {
  BoxScoreUnits,
  DisplayPrefs,
  NotificationPrefs,
} from "@/lib/storage";
import {
  requestPermission,
  type PermissionState,
} from "@/lib/notifications";
import { useTitle } from "@/lib/title";
import { sendToDataLayer, events } from "@/lib/analytics";

/** Discriminator for the auth-aware portions of the Settings screen. Guest
 *  users see the upgrade-to-profile CTA; authenticated users see an Account
 *  section with email, change-password, and sign-out affordances. */
export type AuthInfo =
  | { status: "guest" }
  | { status: "authenticated"; email: string };

interface SettingsScreenProps {
  name: string;
  follows: string[];
  notifications: NotificationPrefs;
  permission: PermissionState;
  prefs: DisplayPrefs;
  authInfo: AuthInfo;
  onUpdateName: (name: string) => void;
  onToggleFollow: (abbr: string) => void;
  onManageFollows: () => void;
  onResetOnboarding: () => void;
  onUpdateNotifications: (next: NotificationPrefs) => void;
  onUpdatePrefs: (next: DisplayPrefs) => void;
  onSignOut: () => void;
  onChangePassword: () => void;
  onUpgradeToProfile: () => void;
}

export function SettingsScreen({
  name,
  follows,
  notifications,
  permission,
  prefs,
  authInfo,
  onUpdateName,
  onToggleFollow,
  onManageFollows,
  onResetOnboarding,
  onUpdateNotifications,
  onUpdatePrefs,
  onSignOut,
  onChangePassword,
  onUpgradeToProfile,
}: SettingsScreenProps) {
  useTitle("Settings");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [unitsSheetOpen, setUnitsSheetOpen] = useState(false);
  const isAuthed = authInfo.status === "authenticated";

  return (
    <>
      <AppBar title="Settings" />
      <div className="bg-canvas px-[14px] md:px-6 pt-2 pb-[100px] max-w-[640px] w-full mx-auto">
        {/* ── Profile chip ─────────────────────────────────────── */}
        <div className="mt-3 bg-surface border border-line rounded-[14px] p-4 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-mono text-[18px] font-bold">
            {name?.[0]?.toUpperCase() ?? "G"}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  onUpdateName(nameDraft.trim() || name);
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onUpdateName(nameDraft.trim() || name);
                    setEditingName(false);
                  }
                }}
                className="w-full border border-line bg-canvas rounded-[8px] px-2.5 py-1.5 font-head text-[18px] font-bold text-ink outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setNameDraft(name);
                  setEditingName(true);
                }}
                className="bg-transparent border-none p-0 text-left cursor-text font-head text-[18px] font-bold text-ink tracking-[-0.3px]"
              >
                {name || "Guest"}
              </button>
            )}
            <div className="text-[11px] text-ink-3 mt-0.5">
              {isAuthed ? "Synced to your profile · Tap name to edit" : "Saved locally · Tap name to edit"}
            </div>
          </div>
        </div>

        {/* ── Upgrade-to-profile CTA (guests only) ─────────────── */}
        {!isAuthed && (
          <div
            data-cy="upgrade-cta"
            className="mt-3 bg-surface border border-accent rounded-[14px] p-4"
            style={{ background: "color-mix(in srgb, var(--color-accent) 4%, var(--color-surface))" }}
          >
            <div className="font-head text-[15px] font-bold text-ink tracking-[-0.2px]">
              Create a profile
            </div>
            <p className="mt-1 text-[12px] text-ink-2 leading-relaxed">
              Sync your follows and preferences across devices. Free, takes a minute.
            </p>
            <button
              onClick={onUpgradeToProfile}
              data-cy="upgrade-cta-button"
              className="mt-2.5 w-full px-3 py-2.5 bg-accent text-white rounded-[10px] border-none cursor-pointer font-head text-[14px] font-semibold tracking-[-0.2px]"
            >
              Get started
            </button>
          </div>
        )}

        {/* ── Following ────────────────────────────────────────── */}
        <SectionLabel>Following · {follows.length}</SectionLabel>

        <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
          {follows.length === 0 && (
            <div className="p-6 text-center text-ink-3 text-[13px]">
              Not following any teams. Tap “Manage teams” below to pick a club.
            </div>
          )}
          {follows.map((abbr, i) => {
            const t = TEAMS[abbr];
            return (
              <div
                key={abbr}
                className={`flex items-center gap-3 px-3.5 py-3 ${i === follows.length - 1 ? "" : "border-b border-line-2"
                  }`}
              >
                <TeamBadge abbr={abbr} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="font-head text-sm font-bold text-ink tracking-[-0.2px]">
                    {t?.name ?? abbr}
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {t?.city} · {t?.div}
                  </div>
                </div>
                <button
                  onClick={() => onToggleFollow(abbr)}
                  aria-label={`Unfollow ${abbr}`}
                  className="bg-transparent border-none p-1.5 cursor-pointer text-accent font-ui text-[13px] font-semibold"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={onManageFollows}
          className="mt-3 w-full px-3 py-3 bg-transparent border border-dashed border-line rounded-[12px] cursor-pointer font-head text-[14px] font-semibold text-ink"
        >
          + Manage teams
        </button>

        {/* ── Appearance ───────────────────────────────────────── */}
        <SectionLabel>Appearance</SectionLabel>
        <AppearanceRow
          theme={prefs.theme}
          onToggle={() => {
            const nextTheme: DisplayPrefs["theme"] = prefs.theme === "twilight" ? "light" : "twilight";
            sendToDataLayer({
              event: events.THEME_CHANGE,
              meta: { theme: nextTheme },
            });
            onUpdatePrefs({ ...prefs, theme: nextTheme });
          }}
        />

        {/* ── Alerts ───────────────────────────────────────────── */}
        <SectionLabel>Alerts</SectionLabel>
        <AlertsCard
          notifications={notifications}
          permission={permission}
          onUpdate={onUpdateNotifications}
        />

        {/* ── Preferences ──────────────────────────────────────── */}
        <SectionLabel>Preferences</SectionLabel>
        <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
          <DisclosureRow
            label="Box score units"
            value={prefs.boxScoreUnits === "imperial" ? "Imperial" : "Metric"}
            onClick={() => setUnitsSheetOpen(true)}
          />
          <ToggleRow
            label="Win probability graph"
            on={prefs.winProbability}
            onToggle={() => onUpdatePrefs({ ...prefs, winProbability: !prefs.winProbability })}
          />
          <ToggleRow
            label="Pitch-by-pitch"
            on={prefs.pitchByPitch}
            onToggle={() => onUpdatePrefs({ ...prefs, pitchByPitch: !prefs.pitchByPitch })}
            last
          />
        </div>

        {/* ── Account (authenticated only) ─────────────────────── */}
        {isAuthed && (
          <>
            <SectionLabel>Account</SectionLabel>
            <div
              data-cy="account-card"
              className="bg-surface border border-line rounded-[14px] overflow-hidden"
            >
              <div className="flex items-center gap-3 px-3.5 py-3.5 border-b border-line-2">
                <div className="flex-1 font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
                  Email
                </div>
                <span
                  data-cy="account-email"
                  className="font-mono text-[12px] text-ink-2 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
                >
                  {authInfo.email}
                </span>
              </div>
              <button
                data-cy="change-password"
                onClick={onChangePassword}
                className="w-full flex items-center gap-3 px-3.5 py-3.5 bg-transparent text-left cursor-pointer border-b border-line-2"
              >
                <div className="flex-1 font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
                  Change password
                </div>
                <IconChevron size={16} stroke="var(--color-ink-3)" />
              </button>
              <button
                data-cy="sign-out"
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-3.5 py-3.5 bg-transparent text-left cursor-pointer"
              >
                <div className="flex-1 font-head text-[15px] font-semibold text-neg tracking-[-0.2px]">
                  Sign out
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Reset (guests only — auth users sign out instead) ── */}
        {!isAuthed && (
          <div className="mt-7">
            <button
              onClick={onResetOnboarding}
              className="w-full px-3 py-3 bg-transparent border border-dashed border-line rounded-[12px] cursor-pointer font-ui text-xs font-semibold text-ink-2"
            >
              Reset onboarding (clear local data)
            </button>
          </div>
        )}

        <div className="mt-8 flex justify-center opacity-50">
          <Wordmark />
        </div>
        <div className="text-center mt-1.5 text-ink-3 text-[11px] font-mono">
          {process.env.NEXT_PUBLIC_APP_VERSION} · data via MLB Stats API
        </div>
      </div>

      {unitsSheetOpen && (
        <ChooserSheet
          title="Box score units"
          options={[
            { value: "imperial", label: "Imperial", sub: "mph for pitch velocity" },
            { value: "metric", label: "Metric", sub: "km/h for pitch velocity" },
          ]}
          selected={prefs.boxScoreUnits}
          onSelect={(v) => {
            onUpdatePrefs({ ...prefs, boxScoreUnits: v as BoxScoreUnits });
            setUnitsSheetOpen(false);
          }}
          onClose={() => setUnitsSheetOpen(false)}
        />
      )}
    </>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5.5 mb-2 px-1 font-head text-[11px] font-bold tracking-[1.4px] uppercase text-ink-3">
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
  last,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3.5 py-3.5 bg-transparent text-left cursor-pointer ${last ? "" : "border-b border-line-2"
        }`}
    >
      <div className="flex-1 font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
        {label}
      </div>
      <span className="font-mono text-[13px] text-ink-2">{on ? "On" : "Off"}</span>
      <IconChevron size={16} stroke="var(--color-ink-3)" />
    </button>
  );
}

function DisclosureRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-3.5 bg-transparent text-left cursor-pointer border-b border-line-2"
    >
      <div className="flex-1 font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
        {label}
      </div>
      <span className="font-mono text-[13px] text-ink-2">{value}</span>
      <IconChevron size={16} stroke="var(--color-ink-3)" />
    </button>
  );
}

function Switch({
  on,
  disabled,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`relative shrink-0 w-12 h-7 rounded-full border-none p-0.5 transition-colors ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${on ? "bg-accent" : "bg-chip"}`}
    >
      <span
        aria-hidden="true"
        className={`block w-6 h-6 rounded-full bg-surface shadow-sm transition-transform ${on ? "translate-x-5" : "translate-x-0"
          }`}
      />
    </button>
  );
}

function AppearanceRow({ theme, onToggle }: { theme: "light" | "twilight"; onToggle: () => void }) {
  const isDark = theme === "twilight";
  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-3.5">
        <div
          className="w-9 h-9 rounded-[10px] border border-line flex items-center justify-center"
          style={{ background: isDark ? "#0E0F11" : "#F3EFE7" }}
        >
          {isDark ? (
            <IconMoon size={18} stroke="var(--color-ink)" />
          ) : (
            <IconSun size={18} stroke="var(--color-ink)" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
            {isDark ? "Dark mode" : "Light mode"}
          </div>
          <div className="font-mono text-[11px] text-ink-3 tracking-[0.3px] mt-0.5">
            {isDark ? "Twilight palette" : "Daylight palette"}
          </div>
        </div>
        <Switch on={isDark} onClick={onToggle} ariaLabel="Toggle dark mode" />
      </div>
    </div>
  );
}

function AlertsCard({
  notifications,
  permission,
  onUpdate,
}: {
  notifications: NotificationPrefs;
  permission: PermissionState;
  onUpdate: (next: NotificationPrefs) => void;
}) {
  const blocked = permission === "denied";
  const unsupported = permission === "unsupported";
  const active = notifications.enabled && permission === "granted";

  let subtitle: string;
  if (unsupported) subtitle = "Not supported in this browser";
  else if (blocked) subtitle = "Blocked — enable in browser settings";
  else if (permission === "default") subtitle = "Tap to enable browser notifications";
  else if (notifications.enabled) subtitle = "Enabled";
  else subtitle = "Off";

  const handleToggle = async () => {
    if (unsupported || blocked) return;
    if (notifications.enabled) {
      onUpdate({ ...notifications, enabled: false });
      return;
    }
    // Off → On: request permission if needed, then flip the in-app flag.
    let state: PermissionState = permission;
    if (state === "default") state = await requestPermission();
    if (state === "granted") {
      onUpdate({ ...notifications, enabled: true });
    }
    // If state is now "denied", subtitle will refresh on next focus event.
  };

  const updateCategory = (key: "start" | "end" | "score", value: boolean) => {
    onUpdate({ ...notifications, categories: { ...notifications.categories, [key]: value } });
  };

  return (
    <div className="bg-surface border border-line rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-3.5">
        <div className="w-10 h-10 rounded-[10px] bg-chip flex items-center justify-center text-ink-2">
          <IconBell size={20} stroke="var(--color-ink)" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-head text-[15px] font-semibold text-ink tracking-[-0.2px]">
            Notifications
          </div>
          <div className={`text-[12px] ${blocked || unsupported ? "text-ink-3" : "text-ink-2"}`}>
            {subtitle}
          </div>
        </div>
        <Switch
          on={active}
          disabled={blocked || unsupported}
          onClick={handleToggle}
          ariaLabel="Toggle game notifications"
        />
      </div>

      {active && (
        <div className="border-t border-line-2">
          <CategoryRow
            label="Game starting"
            description="When a followed team's game begins"
            on={notifications.categories.start}
            onChange={(v) => updateCategory("start", v)}
          />
          <CategoryRow
            label="Game ending"
            description="When a followed team's game finishes"
            on={notifications.categories.end}
            onChange={(v) => updateCategory("end", v)}
          />
          <CategoryRow
            label="Team scores"
            description="When a followed team adds a run"
            on={notifications.categories.score}
            onChange={(v) => updateCategory("score", v)}
            last
          />
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  label,
  description,
  on,
  onChange,
  last,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 pl-[58px] pr-3.5 py-3 ${last ? "" : "border-b border-line-2"
        }`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-head text-[13px] font-semibold text-ink tracking-[-0.2px]">{label}</div>
        <div className="text-[11px] text-ink-3">{description}</div>
      </div>
      <Switch on={on} onClick={() => onChange(!on)} ariaLabel={`Toggle ${label} notifications`} />
    </div>
  );
}

/** Bottom-sheet chooser for multi-option preferences (e.g., units). */
function ChooserSheet({
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  options: { value: string; label: string; sub?: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-surface rounded-t-[18px] pt-3 pb-[calc(env(safe-area-inset-bottom,0)+24px)] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-line mx-auto mb-3" />
        <div className="flex items-center gap-2 px-1 mb-3">
          <div className="flex-1 font-head text-[16px] font-bold text-ink tracking-[-0.3px]">
            {title}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-none p-1 cursor-pointer text-ink-3"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="bg-canvas rounded-[14px] overflow-hidden border border-line-2">
          {options.map((o, i) => {
            const isSelected = o.value === selected;
            return (
              <button
                key={o.value}
                onClick={() => onSelect(o.value)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 bg-transparent text-left cursor-pointer ${i === options.length - 1 ? "" : "border-b border-line-2"
                  }`}
              >
                <div className="flex-1">
                  <div className="font-head text-[14px] font-semibold text-ink tracking-[-0.2px]">
                    {o.label}
                  </div>
                  {o.sub && <div className="text-[11px] text-ink-3 mt-0.5">{o.sub}</div>}
                </div>
                {isSelected && (
                  <span className="font-mono text-[11px] font-bold tracking-[0.8px] uppercase text-accent">
                    Selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
