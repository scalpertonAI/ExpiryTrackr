# Contributing to ExpiryTrackr

Thank you for considering contributing to ExpiryTrackr! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue on GitHub with:

- Clear description of the bug
- Steps to reproduce
- Expected behavior vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, browser, Node version)

### Suggesting Features

We love new ideas! Open an issue with:

- Clear description of the feature
- Use case / problem it solves
- Proposed implementation (optional)
- Mockups or examples (if applicable)

### Pull Requests

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Write clean, documented code
   - Follow existing code style
   - Add tests if applicable
   - Update documentation

4. **Test your changes**
   ```bash
   npm run lint
   npm test
   npm run build
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "Add: Brief description of your changes"
   ```

   Commit message prefixes:
   - `Add:` - New feature
   - `Fix:` - Bug fix
   - `Update:` - Update existing feature
   - `Refactor:` - Code refactoring
   - `Docs:` - Documentation changes
   - `Test:` - Test additions/changes

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request**
   - Provide clear description of changes
   - Link related issues
   - Add screenshots for UI changes

## Development Setup

See the main README.md for detailed setup instructions.

Quick start:
```bash
npm install
cp .env.example .env
# Configure .env with your API keys
npm run dev
```

## Code Style

- Use TypeScript for type safety
- Follow ESLint rules (run `npm run lint`)
- Use Prettier for formatting
- Write meaningful variable names
- Add JSDoc comments for complex functions
- Keep functions small and focused

## Testing

- Write unit tests for new utilities
- Test UI components manually
- Test all API endpoints
- Verify database migrations
- Check accessibility

## Documentation

Update documentation when:
- Adding new features
- Changing API endpoints
- Modifying configuration
- Adding new dependencies

## Questions?

Open an issue or reach out to the maintainers.

Thank you for contributing! 🎉
