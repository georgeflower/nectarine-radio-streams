const REFERENCE_SCENE_MIN = 900;
const MIN_SCENE_SCALE = 0.55;
const MAX_SCENE_SCALE = 1.8;

export const getSceneScale = (width: number, height: number) =>
  Math.max(MIN_SCENE_SCALE, Math.min(MAX_SCENE_SCALE, Math.min(width, height) / REFERENCE_SCENE_MIN));

export const getEatingLayoutForGoose = (
  gooseId: number,
  allEatingGooseIds: number[],
  stageWidth: number,
  stageHeight: number,
  sceneScale: number,
) => {
  const sortedIds = [...allEatingGooseIds].sort((a, b) => a - b);
  const count = Math.max(1, sortedIds.length);
  const index = Math.max(0, sortedIds.indexOf(gooseId));
  const foodX = stageWidth * 0.5;
  const foodY = stageHeight - 28 * sceneScale;
  const radiusX = 62 * sceneScale;
  const radiusY = Math.max(30 * sceneScale, radiusX * 0.55);
  const angle =
    count === 1
      ? -Math.PI / 2
      : count === 2
        ? index === 0
          ? Math.PI
          : 0
        : -Math.PI / 2 + (index / count) * (Math.PI * 2);
  const x = foodX + Math.cos(angle) * radiusX;
  const y = foodY + Math.sin(angle) * radiusY;
  const heading = Math.atan2(foodY - y, foodX - x);
  return { x, y, heading, foodX, foodY, count, index };
};
