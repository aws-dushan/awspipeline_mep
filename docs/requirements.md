You are a senior full-stack architect, senior Next.js developer, PostgreSQL database engineer, and senior UI/UX designer.

Build a production-quality multi-company Pipeline / Enquiry Tracking System.

The application must feel premium, modern, fast, animated, and enjoyable to use. Do not create a plain admin template or basic CRUD application.

The interface should have the usability of Excel / Notion / Airtable, but visually feel like a premium modern SaaS product.

The users will spend many hours every day inside the system, so excellent UX is a major requirement.

---

# 1. TECHNOLOGY STACK

Use:

- Next.js latest stable version
- App Router
- TypeScript
- PostgreSQL
- Prisma ORM
- Tailwind CSS
- shadcn/ui where appropriate
- Framer Motion for animations
- Lucide icons
- TanStack Table for the pipeline data grid
- TanStack Query where beneficial
- Zod for validation
- React Hook Form
- NextAuth / Auth.js or another secure production-ready authentication solution
- ExcelJS or equivalent for Excel export

The application must be responsive but desktop usage is the primary priority because the pipeline contains 17 columns.

Use PostgreSQL as the permanent database.

Do NOT use SQLite for development.

Use environment variables for all credentials and secrets.

---

# 2. OVERALL DESIGN DIRECTION

Create a premium enterprise SaaS UI.

The application must NOT look like:

- a basic Bootstrap admin template
- a plain HTML table
- an old ERP
- a generic CRUD application

The application SHOULD feel similar in quality to modern products such as:

- Linear
- Notion
- Airtable
- Monday.com
- modern HubSpot-style interfaces

Do not copy their branding.

Create our own visual identity.

Use:

- modern spacing
- clean typography
- subtle gradients
- glass effects only where appropriate
- soft shadows
- animated interactions
- premium hover effects
- micro-interactions
- color-coded statuses
- smooth page transitions
- skeleton loaders
- animated dropdowns
- polished modals
- animated notifications
- subtle table row hover effects
- animated buttons
- tasteful background graphics

Animations must be smooth and professional.

Do NOT over-animate the application.

Animations should improve the experience, not slow it down.

Target 60fps interactions.

---

# 3. COMPANY BRANDING

The login screen must prominently use the company logo.

I will provide the company logo file.

Create a reusable branding configuration so the logo can easily be changed later.

The login screen must be FULLY ANIMATED.

It should be one of the strongest visual parts of the application.

Possible animation ideas:

- animated company logo entrance
- subtle floating abstract shapes
- animated gradient background
- flowing light/glow effects
- small particles or moving grid pattern
- animated login card entrance
- animated input focus
- animated login button
- loading animation after successful authentication
- smooth transition into the main application

Do NOT create a childish animation.

It must look professional and enterprise-grade.

Use the company logo as the visual focal point.

---

# 4. LOGIN SCREEN

Create a dedicated full-screen login experience.

Desktop example concept:

LEFT SIDE:
- animated company branding
- company logo
- subtle premium animation
- short text such as:
  "Pipeline Tracker"

RIGHT SIDE:
- modern animated login card
- username/email
- password
- show/hide password
- remember me if appropriate
- sign-in button

On successful login:

Animate the login card out.

Display a short branded transition/loading animation.

Then navigate to company selection or the pipeline.

Authentication must be secure.

Passwords must NEVER be stored as plain text.

Use password hashing.

Protect all authenticated routes.

---

# 5. MULTI-COMPANY ARCHITECTURE

This is a multi-company system.

A user can be assigned to:

- one company
- multiple companies

The system must NEVER expose one company's records to an unauthorized user.

Create proper database-level company relationships.

Every enquiry/pipeline request must belong to a CompanyId.

Every API/server action must validate that the logged-in user has access to the requested company.

Do not rely only on frontend filtering for security.

---

# 6. COMPANY SELECTION

After login:

If user has access to ONE company:

Open that company's pipeline directly.

If user has access to MULTIPLE companies:

Show an animated company selection screen.

Example:

Welcome, John

Select Company

[ Company A ]
[ Company B ]
[ Company C ]

Each company card should:

- animate on hover
- show company name
- optionally show company logo
- have subtle color treatment
- have polished transition effects

When a company is selected:

Animate into the Pipeline Tracker.

Inside the application there should also be a Company Switcher.

---

# 7. USERS AND SUPERVISORS

Users can be assigned to companies.

Users can also be assigned to a supervisor.

Example:

User: John

Companies:
- Company A
- Company B

Reports To:
- Sarah

Supervisor relationship is important because supervisors approve deletion requests.

Create proper relational database models for:

Users
Companies
UserCompanies
SupervisorAssignments

Design it cleanly so this can expand later.

---

# 8. USER ROLES

Start with:

ADMIN
SUPERVISOR
USER

ADMIN can:

- manage companies
- manage users
- assign users to companies
- assign supervisors
- configure dropdown values
- see relevant audit information
- access deleted record history if permitted

SUPERVISOR can:

- access assigned companies
- work with pipeline
- review deletion requests from users reporting to them
- approve deletion requests
- reject deletion requests

USER can:

- access assigned companies
- view pipeline data
- add requests
- edit permitted requests
- submit deletion requests

Make permissions centralized so additional permissions can later be added.

---

# 9. MAIN PIPELINE SCREEN

The main Pipeline screen is the most important screen in the application.

ALL 17 columns must be visible/accessed on the SAME screen.

Do not move normal pipeline fields into a separate detail page.

Horizontal scrolling is allowed.

The screen should behave like a premium spreadsheet/data grid.

Use exactly these business columns:

1. S.No
2. JOB NO
3. Enquiry Date
4. Sales Responsible
5. Customer Name
6. Project Name
7. Status
8. Location
9. Material
10. Enquiry Details
11. Quote Value
12. Probability
13. Exp Order Date
14. Exp Billing Date
15. Email
16. Phone Number
17. Remarks

Keep the same column order.

Column reordering is NOT required.

Saved views are NOT required.

---

# 10. TABLE / DATA GRID DESIGN

Use TanStack Table or another strong React data grid solution.

The table must be visually attractive.

Features:

- sticky table header
- smooth horizontal scrolling
- good spacing
- alternating visual density where useful
- row hover animation
- selected row highlight
- color-coded dropdown badges
- loading skeletons
- smooth empty state
- responsive column widths
- tooltips for truncated content
- polished scrollbars
- fixed/pinned important left-side columns if useful

Do not make the table overly colorful.

Use color strategically.

---

# 11. COLOR CODING

Status values must be visually color-coded.

Do not hard-code the business meaning of every value because admins can create their own values.

Allow dropdown configuration to optionally include:

- label
- color
- sort order
- active/inactive

For example:

Pending = amber
Quoted = blue
Won = green
Lost = red

Probability can also have appropriate color intensity.

Material and Location may use subtle colored pills.

The table should be easy to scan visually.

---

# 12. DROPDOWN CONFIGURATION

Admin must be able to create/manage dropdown values for:

STATUS
LOCATION
MATERIAL
PROBABILITY

These values must NOT be hard-coded.

Make dropdown values company-specific.

Example database concept:

DropdownType
- id
- key

DropdownValue
- id
- companyId
- type
- label
- color
- sortOrder
- active
- createdAt
- updatedAt

Admin can:

- add value
- edit value
- activate/deactivate value
- change display order
- optionally assign color

Avoid permanently deleting dropdown values because historical records may reference them.

Use inactive instead.

---

# 13. ADD REQUEST

Users must be able to add a new pipeline/enquiry request.

Add a prominent:

+ Add Request

button.

When clicked:

Open an attractive animated modal or side drawer.

The user should NOT feel like they have left the pipeline screen.

Form contains all required pipeline fields.

Use appropriate components:

Enquiry Date:
date picker

Sales Responsible:
user dropdown

Customer Name:
text

Project Name:
text

Status:
admin-defined dropdown

Location:
admin-defined dropdown

Material:
admin-defined dropdown

Enquiry Details:
textarea

Quote Value:
numeric/currency input

Probability:
admin-defined dropdown

Expected Order Date:
date picker

Expected Billing Date:
date picker

Email:
email input

Phone:
phone/text input

Remarks:
textarea

Validation must be clear and animated.

Show errors next to the fields.

Successful save:

- close modal smoothly
- show success toast
- insert the new row at the TOP of the pipeline
- optionally animate/highlight the newly added row briefly

---

# 14. NEWEST REQUEST ALWAYS FIRST

Newest created request must always appear first.

Use:

ORDER BY createdAt DESC

Do not rely on:

- S.No
- Job No
- enquiry date

CreatedAt determines the default newest-first order.

---

# 15. FILTER EVERY COLUMN

Every column must support filtering.

Provide a filter control in every column header.

The filter type should match the data type.

S.No:
exact/range/search

Job No:
search

Enquiry Date:
date or date range

Sales Responsible:
multi-select users

Customer Name:
search and/or available existing values

Project Name:
search

Status:
multi-select available company status values

Location:
multi-select available company locations

Material:
multi-select available company materials

Enquiry Details:
contains text

Quote Value:
minimum / maximum

Probability:
multi-select configured probability values

Expected Order Date:
date/date range

Expected Billing Date:
date/date range

Email:
contains/search

Phone:
contains/search

Remarks:
contains/search

Multiple filters must work together.

Example:

Company = Company A
Sales Responsible = John
Status = Quoted
Location = Dubai
Material = AC
Probability = 75%

All filters must work simultaneously.

Display active filter indicators clearly.

Have:

Clear All Filters

button.

Filter menus should be animated and visually polished.

---

# 16. EXCEL EXPORT

Add:

Export Excel

button.

This is a mandatory V1 feature.

Excel export must export EXACTLY the current filtered dataset.

For example, if the screen is filtered by:

Status = Quoted
Location = Dubai
Sales Responsible = John

then export ONLY those matching records.

Export must NOT simply export the currently loaded pagination page.

Export all records matching:

- selected company
- active filters
- non-deleted status

The export should use the SAME backend filter/query logic as the main pipeline.

Excel column order:

1. S.No
2. JOB NO
3. Enquiry Date
4. Sales Responsible
5. Customer Name
6. Project Name
7. Status
8. Location
9. Material
10. Enquiry Details
11. Quote Value
12. Probability
13. Exp Order Date
14. Exp Billing Date
15. Email
16. Phone Number
17. Remarks

Format Excel professionally.

Include:

- bold header
- frozen header row
- Excel auto filters
- sensible column widths
- proper date types
- proper numeric Quote Value
- percentage formatting where appropriate

Example filename:

CompanyName_Pipeline_2026-09-16.xlsx

If filters are active:

CompanyName_Pipeline_Filtered_2026-09-16.xlsx

---

# 17. DELETE REQUEST WORKFLOW

Users must NOT directly delete records.

Users can REQUEST deletion.

On row actions:

Request Delete

When clicked:

Show animated confirmation modal.

Display:

Job No
Customer
Project if available

Require:

Reason for deletion

Deletion reason is mandatory.

After submission:

Create a DeleteRequest record.

The actual pipeline record remains active.

Delete request should store:

- enquiryId
- requestedBy
- requestedAt
- reason
- supervisorId
- status

Statuses:

PENDING
APPROVED
REJECTED

---

# 18. SUPERVISOR DELETE APPROVAL

Supervisor must have a Delete Requests screen or notification area.

Supervisor should see requests from users who report to them.

Each request should display:

- Job No
- Customer
- Enquiry Date
- Requested By
- Requested At
- Delete Reason

Buttons:

Approve
Reject

For Reject:

allow optional rejection note.

Animate approval/rejection interactions professionally.

---

# 19. SOFT DELETE ONLY

Do NOT permanently delete enquiry records.

Never execute destructive record deletion for normal workflow.

When supervisor approves:

Set:

isDeleted = true
deletedAt
deletedBy
deleteReason

The record then disappears from the normal pipeline UI.

It must still remain in PostgreSQL.

Normal user query must always include something equivalent to:

WHERE companyId = selectedCompany
AND isDeleted = false

Deleted records must NOT appear in:

- normal pipeline
- normal search
- normal filtered results
- normal Excel export

Admin may later access deleted records/audit history.

---

# 20. AUDIT LOG

Implement an audit trail.

Important changes must be recorded.

Track:

- request created
- request edited
- field changes
- deletion requested
- deletion rejected
- deletion approved
- dropdown configuration changes where practical

Example:

16 Sep 2026 10:35
John created Job 1260

16 Sep 2026 11:20
John changed Status:
Pending → Quoted

16 Sep 2026 11:21
John changed Quote Value:
AED 50,000 → AED 55,000

16 Sep 2026 14:00
John requested deletion
Reason: Duplicate enquiry

16 Sep 2026 14:10
Sarah approved deletion

Use structured audit data, not only plain text.

---

# 21. DATABASE DESIGN

Design a proper normalized PostgreSQL schema.

Expected major tables/models:

Company

User

UserCompany

SupervisorAssignment

Enquiry

DropdownType

DropdownValue

DeleteRequest

AuditLog

Session / authentication-related tables as required

Potential Enquiry fields:

id
companyId
serialNo
jobNo
enquiryDate
salesResponsibleId
customerName
projectName
statusValueId
locationValueId
materialValueId
enquiryDetails
quoteValue
probabilityValueId
expectedOrderDate
expectedBillingDate
email
phoneNumber
remarks

createdById
createdAt
updatedById
updatedAt

isDeleted
deletedAt
deletedById
deleteReason

Use proper foreign keys.

Use indexes.

Important indexes should include combinations such as:

companyId
companyId + createdAt
companyId + isDeleted
salesResponsibleId
statusValueId
locationValueId
materialValueId

Add other indexes based on query requirements.

Use DECIMAL/NUMERIC for currency.

Never use floating point for Quote Value.

---

# 22. SECURITY

Security is mandatory.

Implement:

- protected routes
- authenticated API/server actions
- company authorization on EVERY server-side data operation
- role permission checks
- hashed passwords
- secure sessions
- CSRF protection where required
- validation with Zod
- parameterized/database-safe queries
- no raw unvalidated SQL
- rate limiting for login where practical

A user should NEVER be able to modify a URL or API request to access another company's data.

Company security must be enforced server-side.

---

# 23. APPLICATION SHELL

Main application shell should include:

Top navigation:

- company logo
- application name
- selected company
- company switcher
- notification icon
- user profile menu

Optional compact sidebar:

Pipeline
Delete Requests
Users
Companies
Dropdown Settings
Audit

Only show items permitted for the user's role.

Use smooth layout animations.

Sidebar should feel modern and compact.

---

# 24. NOTIFICATIONS

Use premium toast notifications.

Examples:

Request added successfully

Request updated

Delete request submitted to Sarah

Deletion approved

Deletion rejected

Export ready

Error messages must also be user-friendly.

Use animations.

---

# 25. UX DETAILS

Pay careful attention to:

- loading states
- skeleton states
- empty states
- error states
- focus states
- keyboard accessibility
- hover states
- active row states
- date picker UX
- dropdown UX
- form validation
- large dataset performance

Users should never wonder whether an action worked.

Every interaction should have immediate visual feedback.

---

# 26. PERFORMANCE

The system may eventually contain many thousands of pipeline rows.

Design for this from the beginning.

Use:

- server-side filtering where appropriate
- database indexes
- efficient pagination or virtualization
- debounced text searching
- optimized queries
- React Server Components where appropriate
- client components only when interaction requires them

Do not load the entire company database into the browser just to filter it.

Excel export should run against the backend query.

---

# 27. VISUAL POLISH

Create deliberate visual hierarchy.

Example possible styling:

Background:
soft neutral / very subtle gradient

Primary color:
derived from company branding/logo

Status badges:
colored pills

Won:
positive green

Lost:
red

Pending:
amber

Quoted:
blue

Table:
clean white/dark surface with subtle borders

Hover:
slight elevation/background transition

Use the actual uploaded/provided company logo to derive the primary visual style where possible.

Build light mode first.

Structure styling so dark mode can be added later if required.

---

# 28. LOGIN ANIMATION QUALITY

Spend extra effort on the login screen.

I want the first impression to feel premium.

Create:

- animated branded background
- animated company logo reveal
- layered subtle motion
- premium login form
- animated focus state
- animated submit button
- loading state
- successful login transition

Do not add unnecessary marketing descriptions.

Keep wording minimal.

Primary focus should be:

Company Logo

Pipeline Tracker

Login

---

# 29. ADMIN SCREENS

Admin screens required:

Company Management

User Management

Company/User Assignment

Supervisor Assignment

Dropdown Settings

Potential future Audit screen

User creation should include:

Name
Email / Username
Password or invite process
Role
Assigned Companies
Supervisor
Active/Inactive

---

# 30. RESPONSIVE BEHAVIOR

Desktop is the primary application.

For tablet:

Allow horizontal table scrolling.

For mobile:

Keep basic access usable but do not destroy the 17-column desktop workflow just to make the grid fit a small phone.

Mobile can use horizontal scrolling or a simplified presentation if necessary.

Desktop must remain the priority.

---

# 31. CODE QUALITY

Write production-quality code.

Use:

- reusable components
- proper folder structure
- strong TypeScript typing
- clear naming
- services/repositories where useful
- centralized permissions
- centralized company-access checks
- reusable filtering logic
- reusable dropdown management
- reusable audit logging

Do not create one giant page.tsx file.

Do not duplicate business logic.

---

# 32. EXPECTED PROJECT STRUCTURE

Design a clean architecture similar to:

app/
  (auth)/
    login/
  (dashboard)/
    pipeline/
    delete-requests/
    admin/
      companies/
      users/
      dropdowns/

components/
  pipeline/
  table/
  forms/
  auth/
  layout/
  ui/

lib/
  auth/
  permissions/
  database/
  filters/
  audit/
  export/
  validation/

prisma/
  schema.prisma
  migrations/
  seed.ts

You may adjust the structure if you have a stronger architecture.

---

# 33. SEED DATA

Create development seed data.

Include:

2 companies

1 admin

2 supervisors

several users

several status values

several locations

several materials

several probability values

sample enquiries

Example statuses:

Pending
Quoted
Won
Lost

Example locations:

Dubai
Sharjah
Abu Dhabi

Example probability:

25%
50%
75%
100%

These are SEED values only.

Application logic must never depend on these exact values.

---

# 34. IMPORTANT BUSINESS RULES

These rules are mandatory:

1. Every enquiry belongs to exactly one company.

2. Users only access companies assigned to them.

3. All 17 pipeline columns stay accessible on the same Pipeline screen.

4. The user can add a new request.

5. Newly created requests appear at the top.

6. Status, Location, Material and Probability are admin-configured dropdowns.

7. Dropdown values can be company-specific.

8. Every column has filtering.

9. Multiple filters work simultaneously.

10. Excel export exports the complete filtered result.

11. Excel export only exports current company data.

12. Deleted records are excluded from normal export.

13. Users cannot directly delete enquiries.

14. User must provide a reason for a deletion request.

15. User's supervisor approves/rejects deletion.

16. Approved deletion is a SOFT DELETE.

17. Deleted data remains permanently in PostgreSQL.

18. Deleted records disappear from the normal UI.

19. Maintain audit history.

20. Company-level authorization must be enforced server-side.

---

# 35. IMPLEMENTATION APPROACH

Do not only provide me with design suggestions.

Actually build the application.

Work systematically.

Start by:

1. analyzing these requirements
2. creating architecture
3. creating Prisma schema
4. creating authentication
5. implementing company/role permissions
6. creating seed data
7. building animated login
8. building company selection
9. building the application shell
10. building the Pipeline data grid
11. implementing Add Request
12. implementing filters
13. implementing Excel export
14. implementing admin dropdown configuration
15. implementing users/companies/supervisors
16. implementing deletion approval
17. implementing audit logging
18. polishing animations and UI
19. testing authorization and edge cases

Create a TODO checklist in the project and update it as implementation progresses.

---

# 36. UI QUALITY CHECK

Before considering each screen finished, ask:

Does this look like something users will enjoy working in every day?

Does this look like a professionally funded SaaS application?

Is the visual hierarchy clean?

Are animations tasteful?

Is the table easy to scan?

Can a user immediately understand what to do?

If not, continue improving it.

Do not accept a plain functional UI as complete.

---

# 37. FINAL GOAL

The final application should feel like:

"An attractive, animated, modern multi-company sales pipeline system that combines the convenience of Excel with the control, security, auditability and workflow of an enterprise web application."

Functionality is essential, but UX and visual quality are equally important.

Build the full application accordingly.