# Separate Admin console navigation

User requested removing the admin section from Studio and switching admin pages to sidebar navigation.

All existing `/admin` pages use the shared AdminShell: desktop fixed 256px sidebar, grouped workspace/billing/operations links, active page styling, separate header/account control, and shared content area. At smaller widths a Menu admin button opens the navigation, closes on navigation/Escape, and resets on page changes. Skip-to-content link is provided. The Studio header's operator account dropdown offers a single Buka Admin console link; its sidebar has only Studio functionality. The unused StudioAdminNavigation component was removed. Admin account menus no longer include the user Account page shortcut. Authentication and reporting/mutation logic are unchanged.

Changed components: AdminShell, AdminNavigation, new AdminMobileNavigation, StandaloneShell and AccountMenu. No routes renamed, data altered, or production deployment performed.

Verification: eight frontend tests passed; JSX compilation passed for changed shell/mobile/account/Studio components; root limited syntax lint and whitespace diff checks passed. Browser verified actual Economics report under the new shell, desktop sidebar at 1366x900, mobile menu navigation to Accounts and close-on-navigation, and Studio sidebar without admin links. Operator account dropdown opens the separate console. Temporary viewport override reset after testing. Screenshot `/private/tmp/nexoclip-admin-sidebar-full.jpg`.
