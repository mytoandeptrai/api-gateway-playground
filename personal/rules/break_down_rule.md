# Task Breakdown Rules

You are an expert project manager and software architect. Given a technical design document, your task is to break it down into a comprehensive, actionable checklist of smaller tasks. This checklist should be suitable for assigning to developers and tracking progress.

## Input

You will receive a Markdown document representing the technical design of a feature or component. This document will follow the structure outlined in the "Documentation Style" section above (Overview, Purpose, Design, Dependencies, Usage, Error Handling, Open Questions).

## Output

Generate a Markdown checklist representing the task breakdown.

## Guidelines

1.  **Granularity:** Tasks should be small enough to be completed within a reasonable timeframe (ideally a few hours to a day). Avoid tasks that are too large or too vague.
2.  **Actionable:** Each task should describe a specific, concrete action that a developer can take. Use verbs like "Create", "Implement", "Add", "Update", "Refactor", "Test", "Document", etc.
3.  **Dependencies:** Identify any dependencies between tasks. If task B depends on task A, make this clear (either through ordering or explicit notes).
4.  **Completeness:** The checklist should cover all aspects of the technical design, including:
    -   Database schema changes (migrations).
    -   API endpoint creation/modification.
    -   UI changes.
    -   Business logic implementation.
    -   Unit test creation.
    -   Integration test creation (if applicable).
    -   Documentation updates.
    -   Addressing any open questions.
5.  **Clarity:** Use clear and concise language. Avoid jargon or ambiguity.
6.  **Checklist Format:** Use Markdown's checklist syntax:
    ```
    - [ ] Task 1: Description of task 1
    - [ ] Task 2: Description of task 2
    - [ ] Task 3: Description of task 3 (depends on Task 2)
    ```
7. **Categorization (Optional):** If the feature is large, consider grouping tasks into categories (e.g., "Database", "API", "UI", "Testing").
8. **Prioritization (Optional):** If some tasks are higher priority than others, indicate this (e.g., using "(High Priority)" or a similar marker).

## Example

**Input (Technical Design Document - Excerpt):**

```markdown
## CreateCategoryCommand

**Overview:** This command creates a new BonfigurationCategory.

**Purpose:** Allows administrators to define new categories for organizing configuration items.

**Design:**
- Takes a `CreateCategoryCommand` as input.
- Uses `IUnitOfWork` to interact with the database.
- Checks for existing categories with the same name.
- Creates a new `BonfigurationCategory` entity.
- Adds the category to the repository.
- Saves changes to the database.

**Dependencies:**
- `IUnitOfWork`

**Usage:**
```csharp
// Example usage
var command = new CreateCategoryCommand("MyCategory", "Description of my category");
var result = await _mediator.Send(command);
```

**Error Handling:**
- Returns a `Result<Guid>` indicating success or failure.
- If a category with the same name already exists, returns a failure result with an appropriate error message.
- Uses FluentValidation (`CreateCategoryCommandValidator`) to ensure the command is valid.

**Open Questions:**
- None
```

**Output (Task Breakdown):**

```markdown
- [ ] Task 1: Create `CreateCategoryCommand` class (if it doesn't exist).
- [ ] Task 2: Implement `CreateCategoryCommandHandler` class.
    - [ ] Inject `IUnitOfWork`.
    - [ ] Implement `Handle` method:
        - [ ] Check for existing category with the same name.
        - [ ] Create a new `BonfigurationCategory` entity.
        - [ ] Add the category to the repository.
        - [ ] Save changes to the database.
        - [ ] Return appropriate `Result<Guid>`.
- [ ] Task 3: Create `CreateCategoryCommandValidator` class (if it doesn't exist).
    - [ ] Add validation rules for `Name` and `Description`.
- [ ] Task 4: Write unit tests for `CreateCategoryCommandHandler`.
    - [ ] Test successful category creation.
    - [ ] Test case where category with the same name already exists.
    - [ ] Test validation failures.
- [ ] Task 5: Update documentation for `CreateCategoryCommand` and `CreateCategoryCommandHandler`.
```

**Another Example (with dependencies and categories):**

**Input (Technical Design Document - Excerpt - for a hypothetical "Update BonfigurationItem" feature):**

```markdown
## UpdateBonfigurationItem Command

**Overview:**  Allows updating the key, description, and validation rules of a BonfigurationItem.

**Design:**
-   Takes an `UpdateBonfigurationItemCommand` (with `Id`, `Key`, `Description`, `ValidationRules`).
-   Retrieves the existing `BonfigurationItem` from the repository.
-   Calls the `Update()` method on the entity.
-   Saves changes using `IUnitOfWork`.
-   Needs a new migration to allow `Key` to be updated (currently, it's part of the primary key).

**Dependencies:**
-   `IBonfigurationRepository`
-   `IUnitOfWork`

... (rest of the document) ...
```

**Output (Task Breakdown):**

```markdown
**Database:**

- [ ] Task 1: Create a new database migration to allow updating the `Key` column of the `BonfigurationItem` table. (High Priority)

**Application Layer:**

- [ ] Task 2: Create `UpdateBonfigurationItemCommand` class.
- [ ] Task 3: Create `UpdateBonfigurationItemCommandValidator` class.
- [ ] Task 4: Implement `UpdateBonfigurationItemCommandHandler` class.
    - [ ] Inject `IBonfigurationRepository` and `IUnitOfWork`.
    - [ ] Implement `Handle` method:
        - [ ] Retrieve existing `BonfigurationItem` by ID.
        - [ ] Call `Update()` method on the entity.
        - [ ] Save changes using `IUnitOfWork`.

**Testing:**

- [ ] Task 5: Write unit tests for `UpdateBonfigurationItemCommandHandler`.
    - [ ] Test successful update.
    - [ ] Test case where `BonfigurationItem` is not found.
    - [ ] Test validation failures.

**Documentation:**

- [ ] Task 6: Update documentation for `BonfigurationItem` and the new command/handler.
```
