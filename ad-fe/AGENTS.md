# AI Agent Implementation Checklist (`R-AdvertiseIQ`)

Read this file before implementing any feature, page, route, modal, action, or API integration in the frontend codebase.

> **Scope rule:** Check each item below before starting implementation. If a check applies to the task, follow it; otherwise, leave it.

---

## Things to Check Before Implementing Any Task

### 1. Multi-Language Support
- Support all existing project languages configured in `src/i18n.js` (`en`, `de`, `fr`, `es`, `it`, `pt`, `ja`, `zh`, `hi` — `nsSeparator: false`, `keySeparator: false`).
- Wrap all user-facing copy, labels, tooltips, and messages using `useTranslation()` (`t(...)`) / `i18next`.
- Add matching translation keys to every locale file under `src/locales/`:
  `en.json`, `de.json`, `fr.json`, `es.json`, `it.json`, `pt.json`, `ja.json`, `zh.json`, `hi.json`.

### 2. User Guide
- Follow existing User Guide patterns and update documentation when adding new features, pages, workflows, or user-facing settings.
- Update `userGuideSections` in `src/layout/views/userGuide/UserGuideContent.js` (and `src/layout/views/userGuide/UserGuide.js` / assets under `public/guide-images/` if needed).
- If the task adds or modifies an interactive product tour or targeted element IDs/selectors, update the corresponding config under `src/tour/config/`.

### 3. Audit Logs
- Ensure all relevant state-changing operations (create, update, delete, permission/setting/rule/bid/budget changes) maintain audit logs.
- When adding or wiring actions to backend endpoints, check `Node-AdvertiseIQ/api-server/constants/auditRouteEvents.js`, `Node-AdvertiseIQ/api-server/middleware/auditRequest.js`, and `Node-AdvertiseIQ/api-server/helpers/auditHelper.js`, and verify display/filtering in `src/layout/views/Audit Log/AuditLog.js` if new event types or targets are introduced.

### 4. Mock Data
- Provide mock/demo data for development, demo mode, and automated tests for new views, charts, tables, and API workflows.
- Verify behavior in Demo Mode (`isMockTestingUser` on backend endpoints) and respect `src/components/DemoModeSubmitGuard.js` (write/submit actions stay blocked in Demo Mode; only explicitly safe UI/filter controls may use `data-demo-allow`).
- Add unit tests (`*.test.js`) with mocked API responses covering new UI states and interactions.

### 5. RBAC (Role-Based Access Control)
- Implement and verify role-based access permissions across UI visibility, routing, actions, and paired API endpoints:
  - Frontend constants & checks: `SYSTEM_PAGES` / `PAGE_ACTIONS` in `src/common/constants/permissions.js`, `PermissionCheck(page, type)` in `src/helper/permission/PermissionCheck.js`, route definitions in `src/router/routes.js`, and sidebar navigation in `src/layout/component/sidebar/Sidebar.js`.
  - Backend enforcement (for paired API routes): `SYSTEM_PAGES` in `Node-AdvertiseIQ/api-server/constants/permissions.js` and `validateRoutePermission(...)` in `Node-AdvertiseIQ/api-server/middleware/routePermission.js` (backed by `roleBasedPermission.model.js`, `profileBasedPermission.model.js`, `packages.model.js`).
- **Required Database Changes (Must Report at Task End):**
  - If any RBAC database updates are needed (e.g., inserting a new page entry, updating `roleBasedPermission`, `profileBasedPermission`, `packages`, or Super Admin/plan/role permissions), **explicitly tell the user at the end of the task the exact RBAC database changes and manual/script steps to perform.**
