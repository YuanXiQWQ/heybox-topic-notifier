/** @file 复用设置页卡片和表单控件的管理面板，不声明彩蛋候选槽位。 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, UserAccount } from "../models.ts";
import { accountRole } from "../auth/roles.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import type { Invitation } from "../storage/administration_types.ts";
import { escapeHtml as e, renderLayout } from "./html.ts";
import { materialSymbolIcon as icon } from "./icons.ts";

/** 用户列表的显式投影，不包含密码摘要和其它认证秘密。 */
export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  role: NonNullable<UserAccount["role"]>;
  roleVersion: number;
  createdAt: string;
  primaryEmail: string;
  emailVerified: boolean;
  hasPassword: boolean;
};

/** 将邀请码操作和用户管理组织为紧凑的设置卡片。 @param {object} options 当前管理员、邀请码及已授权的账号列表。 @return {string} 管理面板 HTML。 */
export function renderAdmin(
  options: {
    account: UserAccount;
    ownerHasPassword?: boolean;
    settings: AppSettings;
    csrfToken: string;
    invitations: Invitation[];
    users?: AdminUser[];
    codes: string[];
    error: string;
    saved: boolean;
  },
): string {
  const m = getMessages(options.settings.locale),
    csrf = csrfHiddenInput(options.csrfToken);
  /** @param {string} value ISO 日期。 @return {string} 与当前语言一致的日期时间。 */
  function date(value: string): string {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat(options.settings.locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed)
      : value;
  }
  let fieldIndex = 0;
  /** @param {string} label 表单标签。 @param {string} content 控件或值。 @return {string} 既有设置行。 */
  function row(label: string, content: string): string {
    const id = "admin-field-" + (++fieldIndex);
    const control = /<(?:input|select) /.test(content);
    if (control) {
      content = content.replace(/<(input|select) /, `<$1 id="${id}" `);
    }
    return `<div${label ? "" : ' class="admin-actions-row"'}><dt>${
      control ? `<label for="${id}">${e(label)}</label>` : e(label)
    }</dt><dd>${content}</dd></div>`;
  }
  /** @param {string} name 控件名。 @param {string} value 当前值。 @param {string} type 输入类型。 @param {string} extra 固定 HTML 属性。 @return {string} 表单控件。 */
  function input(name: string, value = "", type = "text", extra = ""): string {
    return `<input name="${name}" value="${e(value)}" type="${type}" ${extra}>`;
  }
  /** @param {string} label 字段标签。 @param {string} control 控件 HTML。 @return {string} 可换行工具栏中的关联标签和控件。 */
  function field(label: string, control: string): string {
    return `<label class="admin-field"><span>${
      e(label)
    }</span>${control}</label>`;
  }
  /** @param {string} selected 当前身份。 @param {boolean} own 是否为操作者本人。 @return {string} 身份选择控件。 */
  function roles(selected = "user", own = false): string {
    return `<select name="role" aria-label="${e(m.accountRole)}">${
      [["user", m.roleUser], ["admin", m.roleAdmin], [
        "superadmin",
        m.roleSuperadmin,
      ]].filter(([value]) => !own || value === "superadmin").map((
        [value, label],
      ) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${
          e(label)
        }</option>`
      ).join("")
    }</select>`;
  }
  /** @param {AdminUser} user 白名单账号字段。 @return {string} 用户资料和独立删除确认表单。 */
  function userCard(user: AdminUser): string {
    const hidden = input("id", user.id, "hidden") +
      input("roleVersion", String(user.roleVersion), "hidden");
    return `<details class="admin-user"><summary>${
      icon("person", "settings-label-icon")
    }<span>${e(user.username)}</span><span class="admin-role">${
      e(
        user.role === "superadmin"
          ? m.roleSuperadmin
          : user.role === "admin"
          ? m.roleAdmin
          : m.roleUser,
      )
    }</span><span class="dropdown-chevron" aria-hidden="true"></span></summary>
    <form method="post" action="/admin/users/edit">${csrf}${hidden}<dl class="settings-list">
    ${row(m.adminUserId, `<bdi>${e(user.id)}</bdi>`)}${
      row(m.adminCreatedAt, `<time>${e(date(user.createdAt))}</time>`)
    }
    ${
      row(
        m.authUsername,
        input(
          "username",
          user.username,
          "text",
          'required maxlength="40" autocomplete="off"',
        ),
      )
    }
    ${
      row(
        m.accountDisplayName,
        input("displayName", user.displayName, "text", 'maxlength="80"'),
      )
    }${row(m.accountRole, roles(user.role, user.id === options.account.id))}
    ${row(m.accountEmail, `<bdi>${e(user.primaryEmail) || "—"}</bdi>`)}
    ${
      row(
        m.adminEmailVerified,
        `<input type="checkbox" disabled ${
          user.emailVerified ? "checked" : ""
        } aria-label="${e(m.adminEmailVerified)}">`,
      )
    }
    ${
      row(
        m.authPassword,
        e(
          user.hasPassword
            ? m.accountPasswordConfigured
            : m.accountPasswordNotConfigured,
        ),
      )
    }
    ${
      row(
        "",
        `<button type="submit">${icon("check", "settings-label-icon")}${
          e(m.accountSave)
        }</button>`,
      )
    }
    </dl></form>${
      user.id !== options.account.id
        ? `<details class="admin-delete"><summary>${
          icon("delete", "settings-label-icon")
        }${
          e(m.adminUserDelete)
        }<span class="dropdown-chevron" aria-hidden="true"></span></summary><form method="post" action="/admin/users/delete">${csrf}${hidden}<label>${
          e(m.adminDeleteConfirm)
        }${
          input("confirmUsername", "", "text", 'required autocomplete="off"')
        }</label><button type="submit" class="danger-button">${
          e(m.adminUserDelete)
        }</button></form></details>`
        : ""
    }</details>`;
  }
  const status = options.error
    ? (options.error === "password"
      ? m.accountPasswordCurrentInvalid
      : options.error === "forbidden"
      ? m.adminAccessDenied
      : options.error === "invalid"
      ? m.adminInputInvalid
      : m.adminConflict)
    : options.saved
    ? m.adminSaved
    : "";
  let body = `<div class="admin-panel"><section class="page-heading"><h1>${
    e(m.adminPanel)
  }</h1></section>${
    status
      ? `<p role="${options.error ? "alert" : "status"}" class="${
        options.error ? "auth-error" : "inline-action-status"
      }">${e(status)}</p>`
      : ""
  }
  <section class="settings-group"><h2>${icon("key", "settings-label-icon")}${
    e(m.invitationCode)
  }</h2><div class="admin-card"><form class="admin-generate" method="post" action="/admin/invitations" data-admin-invitations>${csrf}
  ${
    field(
      m.invitationCount,
      input("count", "1", "number", 'min="1" max="20" required'),
    )
  }${field(m.invitationExpires, input("expiresAt", "", "datetime-local"))}${
    field(m.invitationNote, input("note", "", "text", 'maxlength="120"'))
  }
  <button type="submit">${icon("add", "settings-label-icon")}${
    e(m.invitationGenerate)
  }</button>
  </form>${
    options.codes.length
      ? `<label class="admin-codes">${
        e(m.invitationCode)
      }<textarea readonly dir="ltr" rows="${
        Math.min(8, options.codes.length)
      }">${e(options.codes.join("\n"))}</textarea></label>`
      : ""
  }<div class="admin-invitations">${
    options.invitations.length
      ? options.invitations.map((value) => {
        const state = value.usedAt
          ? m.invitationUsed
          : value.revokedAt
          ? m.invitationRevoked
          : value.expiresAt && Date.parse(value.expiresAt) <= Date.now()
          ? m.invitationExpired
          : m.invitationAvailable;
        return `<div class="admin-invitation"><div><strong>${
          e(value.note || value.id.slice(0, 8))
        }</strong><span>${e(state)}</span></div><dl>${
          row(m.adminCreatedAt, e(date(value.createdAt)))
        }${
          value.expiresAt
            ? row(m.invitationExpires, e(date(value.expiresAt)))
            : ""
        }${
          value.usedAt ? row(m.invitationUsedAt, e(date(value.usedAt))) : ""
        }</dl>${
          !value.usedAt && !value.revokedAt
            ? `<form method="post" action="/admin/invitations/${
              e(value.id)
            }/revoke">${csrf}<button type="submit" class="text-action-button">${
              e(m.invitationRevoke)
            }</button></form>`
            : ""
        }</div>`;
      }).join("")
      : `<p class="admin-empty">${e(m.invitationEmpty)}</p>`
  }</div></div></section>`;
  if (accountRole(options.account) === "superadmin") {
    body += `<section class="settings-group"><h2>${
      icon("badge", "settings-label-icon")
    }${e(m.adminUsers)}</h2>${
      options.users
        ? `<details class="admin-user"><summary>${
          icon("add", "settings-label-icon")
        }${
          e(m.adminUserAdd)
        }<span class="dropdown-chevron" aria-hidden="true"></span></summary><form method="post" action="/admin/users/create">${csrf}<dl class="settings-list">${
          row(
            m.authUsername,
            input(
              "username",
              "",
              "text",
              'required maxlength="40" autocomplete="off"',
            ),
          )
        }${
          row(
            m.accountDisplayName,
            input("displayName", "", "text", 'maxlength="80"'),
          )
        }${row(m.accountRole, roles())}${
          row(
            m.authPassword,
            input(
              "password",
              "",
              "password",
              'required minlength="12" maxlength="1024" autocomplete="new-password"',
            ),
          )
        }${
          row(
            m.authConfirmPassword,
            input(
              "confirmPassword",
              "",
              "password",
              'required minlength="12" maxlength="1024" autocomplete="new-password"',
            ),
          )
        }${
          row("", `<button type="submit">${e(m.adminUserAdd)}</button>`)
        }</dl></form></details>${options.users.map(userCard).join("")}`
        : options.ownerHasPassword === false
        ? `<a class="button-link" href="/settings">${e(m.accountSettings)}</a>`
        : `<form class="admin-card admin-unlock" method="post" action="/admin/unlock">${csrf}${
          field(
            m.accountCurrentPassword,
            input(
              "currentPassword",
              "",
              "password",
              'required maxlength="1024" autocomplete="current-password"',
            ),
          )
        }<button type="submit">${icon("lock", "settings-label-icon")}${
          e(m.adminConfirmIdentity)
        }</button></form>`
    }</section>`;
  }
  body += '</div><script src="/static/admin.js" defer></script>';
  return renderLayout({
    account: options.account,
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    themeColor: options.settings.themeColor,
    locale: options.settings.locale,
    title: m.adminPanel,
    disableEasterEggs: true,
  });
}
