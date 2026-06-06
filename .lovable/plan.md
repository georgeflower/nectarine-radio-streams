## Plan

1. **Stop separating the neck socket during waddles**
   - In `GooseFamily.tsx`, reduce/remove the independent head lateral sway and large head tilt during the bottom-waddle animation.
   - Keep the body bob/tilt, but make the head motion mostly a small vertical dip/peck that stays anchored at the neck pivot.

2. **Anchor the head to the body with a socket wrapper**
   - Replace the current “full head image translates around its own pivot” approach with a nested neck-socket wrapper:

```text
outer goose position + facing direction
  body-frame translate/bob/rotate
    body image
    neck-socket at fixed neck pivot
      head image offset back from socket
```

   - Apply this to both goslings and grown family adults so the neck base inherits the exact same body transform and cannot drift open.

3. **Apply the same socket logic to original white/brown ground waddles**
   - In `FlyingGoose.tsx`, add a socket/frame wrapper around the standing body/head images.
   - During ground mode, mirror/move the whole goose as one unit, and animate the head only from the fixed socket.

4. **Keep scope tight**
   - No reproduction, chatter, food, ball, or scheduler changes.
   - Only adjust waddling/ground-standing transforms for the bottom geese.