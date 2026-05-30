```markdown
# api-gateway-playground Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `api-gateway-playground` repository, a TypeScript codebase focused on experimenting with API gateway concepts. While no specific framework is detected, the repository emphasizes clean code practices, conventional commits, and a structured approach to testing and file organization.

## Coding Conventions

### File Naming
- **Style:** camelCase
- **Example:**  
  ```plaintext
  apiGateway.ts
  userRoutes.ts
  ```

### Import Style
- **Style:** Use aliases for imports where configured.
- **Example:**
  ```typescript
  import apiGateway from '@core/apiGateway';
  import userRoutes from './userRoutes';
  ```

### Export Style
- **Style:** Default exports are preferred.
- **Example:**
  ```typescript
  // In apiGateway.ts
  const apiGateway = { /* ... */ };
  export default apiGateway;
  ```

### Commit Messages
- **Type:** Conventional Commits
- **Prefix:** `feat`
- **Example:**
  ```
  feat: add user authentication middleware to api gateway
  ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature or module  
**Command:** `/feature-development`

1. Create a new file using camelCase naming.
2. Implement the feature using TypeScript.
3. Use default exports for modules.
4. Import dependencies using aliases where applicable.
5. Write or update corresponding test files (`*.test.ts`).
6. Commit changes using a conventional commit message, prefixed with `feat`.

### Testing
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Identify or create test files matching the `*.test.ts` pattern.
2. Use the project's preferred (undetected) testing framework.
3. Run the tests using the appropriate command (e.g., `npm test` or `yarn test`).

### Code Review & Merging
**Trigger:** Before merging changes into the main branch  
**Command:** `/code-review`

1. Ensure all code follows the documented conventions.
2. Confirm all tests pass.
3. Review commit messages for adherence to the conventional format.
4. Submit a pull request for review.

## Testing Patterns

- **Test File Naming:** Suffix test files with `.test.ts` (e.g., `apiGateway.test.ts`).
- **Framework:** Not explicitly detected; follow project or team standards.
- **Example:**
  ```typescript
  // apiGateway.test.ts
  import apiGateway from './apiGateway';

  describe('apiGateway', () => {
    it('should initialize correctly', () => {
      expect(apiGateway).toBeDefined();
    });
  });
  ```

## Commands
| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| /feature-development | Start a new feature using repo conventions|
| /run-tests           | Run all test suites                       |
| /code-review         | Prepare code for review and merging       |
```