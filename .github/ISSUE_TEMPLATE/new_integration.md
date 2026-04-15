---
name: New integration proposal
about: Propose adding a new service integration to the Weldable ecosystem
labels: new-integration
---

## Service

What service or API would this integrate with?

## Actions

What actions would it expose? List the operations a Weldable workflow could perform (e.g. "send message", "create issue", "search files").

## Auth type

How does the service authenticate? (`oauth2`, `api_key`, `basic`, other)

## Are you planning to build it?

- [ ] Yes, I'll open a PR
- [ ] No, just proposing — happy for anyone to pick this up

## Notes

Any relevant API docs, quirks, or prior art worth knowing about?

---

**Before building:** read the [Creating a new integration](../CONTRIBUTING.md#creating-a-new-integration) section of CONTRIBUTING.md and use an existing leaf package as a template.
