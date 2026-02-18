# Ralph Loop - Iteration {{iteration}}

You are in an iterative development loop. Work on the task below until you can genuinely complete it.

{{#if context}}

## Additional Context (added mid-loop)

{{context}}

---

{{/if}}

## Your Task

{{task}}

## Instructions

1. Read the current state of files to understand what's been done
2. Track your progress and plan remaining work
3. Make progress on the task
4. Run tests/verification if applicable
5. When the task is GENUINELY COMPLETE, output:
   <promise>{{completionPromise}}</promise>

## Critical Rules

- ONLY output <promise>{{completionPromise}}</promise> when the task is truly done
- Do NOT lie or output false promises to exit the loop
- If stuck, try a different approach
- Check your work before claiming completion
- The loop will continue until you succeed

## Current Iteration: {{iteration}}{{#if maxIterations}} / {{maxIterations}}{{else}} (unlimited){{/if}} (min: {{minIterations}})

Now, work on the task. Good luck!
