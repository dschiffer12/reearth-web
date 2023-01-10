import { Color, Entity, Cesium3DTileFeature, Cartesian3, Ion } from "cesium";
import type { Viewer as CesiumViewer } from "cesium";
import CesiumDnD, { Context } from "cesium-dnd";
import { isEqual } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CesiumComponentRef, CesiumMovementEvent, RootEventTarget } from "resium";
import { useCustomCompareCallback } from "use-custom-compare";

import { e2eAccessToken, setE2ECesiumViewer } from "@reearth/config";
import { LayerEditEvent } from "@reearth/core/Map";

import type {
  Camera,
  LatLng,
  SelectLayerOptions,
  EngineRef,
  SceneProperty,
  MouseEvent,
  MouseEvents,
} from "..";

import { useCameraLimiter } from "./cameraLimiter";
import {
  getCamera,
  isDraggable,
  isSelectable,
  layerIdField,
  getLocationFromScreen,
  getClock,
} from "./common";
import { getTag, type Context as FeatureContext } from "./Feature";
import useEngineRef from "./useEngineRef";
import { convertCartesian3ToPosition } from "./utils";

export default ({
  ref,
  property,
  camera,
  selectedLayerId,
  selectionReason,
  isLayerDraggable,
  meta,
  onLayerSelect,
  onCameraChange,
  onLayerDrag,
  onLayerDrop,
  onLayerEdit,
  onTick,
}: {
  ref: React.ForwardedRef<EngineRef>;
  property?: SceneProperty;
  camera?: Camera;
  selectedLayerId?: string;
  selectionReason?: string;
  isLayerDraggable?: boolean;
  meta?: Record<string, unknown>;
  onLayerSelect?: (id?: string, options?: SelectLayerOptions) => void;
  onCameraChange?: (camera: Camera) => void;
  onLayerDrag?: (layerId: string, position: LatLng) => void;
  onLayerDrop?: (layerId: string, propertyKey: string, position: LatLng | undefined) => void;
  onLayerEdit?: (e: LayerEditEvent) => void;
  onTick?: (time: Date) => void;
}) => {
  const cesium = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const cesiumIonDefaultAccessToken =
    typeof meta?.cesiumIonAccessToken === "string"
      ? meta.cesiumIonAccessToken
      : Ion.defaultAccessToken;
  const cesiumIonAccessToken = property?.default?.ion || cesiumIonDefaultAccessToken;

  // expose ref
  const engineAPI = useEngineRef(ref, cesium);

  const backgroundColor = useMemo(
    () =>
      property?.default?.bgcolor ? Color.fromCssColorString(property.default.bgcolor) : undefined,
    [property?.default?.bgcolor],
  );

  useEffect(() => {
    engineAPI.changeSceneMode(property?.default?.sceneMode, 0);
  }, [property?.default?.sceneMode, engineAPI]);

  // move to initial position at startup
  const initialCameraFlight = useRef(false);

  const handleMount = useCustomCompareCallback(
    () => {
      if (initialCameraFlight.current) return;
      initialCameraFlight.current = true;
      if (
        property?.cameraLimiter?.cameraLimitterEnabled &&
        property?.cameraLimiter?.cameraLimitterTargetArea
      ) {
        engineAPI.flyTo(property?.cameraLimiter?.cameraLimitterTargetArea, { duration: 0 });
      } else if (property?.default?.camera) {
        engineAPI.flyTo(property.default.camera, { duration: 0 });
      }
      const camera = getCamera(cesium?.current?.cesiumElement);
      if (camera) {
        onCameraChange?.(camera);
      }
      const clock = getClock(cesium?.current?.cesiumElement?.clock);
      if (clock) {
        onTick?.(clock.current);
      }
    },
    [
      engineAPI,
      onCameraChange,
      onTick,
      property?.default?.camera,
      property?.cameraLimiter?.cameraLimitterEnabled,
    ],
    (prevDeps, nextDeps) =>
      prevDeps[0] === nextDeps[0] &&
      prevDeps[1] === nextDeps[1] &&
      prevDeps[2] === nextDeps[2] &&
      isEqual(prevDeps[3], nextDeps[3]) &&
      prevDeps[4] === nextDeps[4],
  );

  const handleUnmount = useCallback(() => {
    initialCameraFlight.current = false;
  }, []);

  // cache the camera data emitted from viewer camera change
  const emittedCamera = useRef<Camera[]>([]);
  const updateCamera = useCallback(() => {
    const viewer = cesium?.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed() || !onCameraChange) return;

    const c = getCamera(viewer);
    if (c && !isEqual(c, camera)) {
      emittedCamera.current.push(c);
      // The state change is not sync now. This number is how many state updates can actually happen to be merged within one re-render.
      if (emittedCamera.current.length > 10) {
        emittedCamera.current.shift();
      }
      onCameraChange?.(c);
    }
  }, [camera, onCameraChange]);

  const handleCameraChange = useCallback(() => {
    updateCamera();
  }, [updateCamera]);

  const handleCameraMoveEnd = useCallback(() => {
    updateCamera();
  }, [updateCamera]);

  useEffect(() => {
    if (camera && !emittedCamera.current.includes(camera)) {
      engineAPI.flyTo(camera, { duration: 0 });
      emittedCamera.current = [];
    }
  }, [camera, engineAPI]);

  // manage layer selection
  useEffect(() => {
    const viewer = cesium.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    const entity = findEntity(viewer, selectedLayerId);
    if (viewer.selectedEntity === entity) return;

    const tag = getTag(entity);
    if (tag?.unselectable) return;

    viewer.selectedEntity = entity;
  }, [cesium, selectedLayerId]);

  const handleMouseEvent = useCallback(
    (type: keyof MouseEvents, e: CesiumMovementEvent, target: RootEventTarget) => {
      if (engineAPI.mouseEventCallbacks[type]) {
        const viewer = cesium.current?.cesiumElement;
        if (!viewer || viewer.isDestroyed()) return;
        const position = e.position || e.startPosition;
        const props: MouseEvent = {
          x: position?.x,
          y: position?.y,
          ...(position
            ? getLocationFromScreen(viewer.scene, position.x, position.y, true) ?? {}
            : {}),
        };
        const layerId = getLayerId(target);
        if (layerId) props.layerId = layerId;
        engineAPI.mouseEventCallbacks[type]?.(props);
      }
    },
    [engineAPI],
  );

  const handleMouseWheel = useCallback(
    (delta: number) => {
      engineAPI.mouseEventCallbacks.wheel?.({ delta });
    },
    [engineAPI],
  );

  const mouseEventHandles = useMemo(() => {
    const mouseEvents: { [index in keyof MouseEvents]: undefined | any } = {
      click: undefined,
      doubleclick: undefined,
      mousedown: undefined,
      mouseup: undefined,
      rightclick: undefined,
      rightdown: undefined,
      rightup: undefined,
      middleclick: undefined,
      middledown: undefined,
      middleup: undefined,
      mousemove: undefined,
      mouseenter: undefined,
      mouseleave: undefined,
      wheel: undefined,
    };
    (Object.keys(mouseEvents) as (keyof MouseEvents)[]).forEach(type => {
      mouseEvents[type] =
        type === "wheel"
          ? (delta: number) => {
              handleMouseWheel(delta);
            }
          : (e: CesiumMovementEvent, target: RootEventTarget) => {
              handleMouseEvent(type as keyof MouseEvents, e, target);
            };
    });
    return mouseEvents;
  }, [handleMouseEvent, handleMouseWheel]);

  const handleClick = useCallback(
    (_: CesiumMovementEvent, target: RootEventTarget) => {
      mouseEventHandles.click?.(_, target);
      const viewer = cesium.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) return;

      if (target && "id" in target && target.id instanceof Entity && isSelectable(target.id)) {
        onLayerSelect?.(target.id.id);
        return;
      }

      if (target && target instanceof Cesium3DTileFeature) {
        const layerId: string | undefined = (target.primitive as any)?.[layerIdField];
        if (layerId) {
          onLayerSelect?.(layerId, {
            overriddenInfobox: {
              title: target.getProperty("name"),
              content: tileProperties(target),
            },
          });
        }
        return;
      }

      onLayerSelect?.();
    },
    [onLayerSelect, mouseEventHandles],
  );

  // E2E test
  useEffect(() => {
    if (e2eAccessToken()) {
      setE2ECesiumViewer(cesium.current?.cesiumElement);
      return () => {
        setE2ECesiumViewer(undefined);
      };
    }
    return;
  }, [cesium.current?.cesiumElement]);

  // update
  useEffect(() => {
    const viewer = cesium.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.requestRender();
  });

  const handleUpdate = useCallback(() => {
    const viewer = cesium.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.requestRender();
  }, []);

  // enable Drag and Drop Layers
  const handleLayerDrag = useCallback(
    (e: Entity, position: Cartesian3 | undefined, _context: Context): boolean | void => {
      const viewer = cesium.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed() || !isSelectable(e) || !isDraggable(e)) return false;

      const pos = convertCartesian3ToPosition(cesium.current?.cesiumElement, position);
      if (!pos) return false;

      onLayerDrag?.(e.id, pos);
    },
    [onLayerDrag],
  );

  const handleLayerDrop = useCallback(
    (e: Entity, position: Cartesian3 | undefined): boolean | void => {
      const viewer = cesium.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) return false;

      const key = isDraggable(e);
      const pos = convertCartesian3ToPosition(cesium.current?.cesiumElement, position);
      onLayerDrop?.(e.id, key || "", pos);

      return false; // let apollo-client handle optimistic updates
    },
    [onLayerDrop],
  );

  const cesiumDnD = useRef<CesiumDnD>();
  useEffect(() => {
    const viewer = cesium.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    cesiumDnD.current = new CesiumDnD(viewer, {
      onDrag: handleLayerDrag,
      onDrop: handleLayerDrop,
      dragDelay: 1000,
      initialDisabled: !isLayerDraggable,
    });
    return () => {
      if (!viewer || viewer.isDestroyed()) return;
      cesiumDnD.current?.disable();
    };
  }, [handleLayerDrag, handleLayerDrop, isLayerDraggable]);
  const { cameraViewBoundaries, cameraViewOuterBoundaries, cameraViewBoundariesMaterial } =
    useCameraLimiter(cesium, camera, property?.cameraLimiter);

  const context = useMemo<FeatureContext>(
    () => ({
      selectionReason,
      flyTo: engineAPI.flyTo,
      getCamera: engineAPI.getCamera,
      onLayerEdit,
    }),
    [selectionReason, engineAPI, onLayerEdit],
  );

  return {
    backgroundColor,
    cesium,
    cameraViewBoundaries,
    cameraViewOuterBoundaries,
    cameraViewBoundariesMaterial,
    cesiumIonAccessToken,
    mouseEventHandles,
    handleMount,
    handleUnmount,
    handleUpdate,
    handleClick,
    handleCameraChange,
    handleCameraMoveEnd,
    context,
  };
};

function tileProperties(t: Cesium3DTileFeature): { key: string; value: any }[] {
  return t
    .getPropertyIds()
    .reduce<{ key: string; value: any }[]>(
      (a, b) => [...a, { key: b, value: t.getProperty(b) }],
      [],
    );
}

function findEntity(viewer: CesiumViewer, layerId: string | undefined): Entity | undefined {
  if (!layerId) return;

  let entity = viewer.entities.getById(layerId);
  if (entity) return entity;

  entity = viewer.entities.values.find(e => getTag(e)?.layerId === layerId);
  if (entity) return entity;

  for (const ds of [viewer.dataSourceDisplay.dataSources, viewer.dataSources]) {
    for (let i = 0; i < ds.length; i++) {
      const entities = ds.get(i).entities.values;
      const e = entities.find(e => getTag(e)?.layerId === layerId);
      if (e) {
        return e;
      }
    }
  }

  return;
}

function getLayerId(target: RootEventTarget): string | undefined {
  if (target && "id" in target && target.id instanceof Entity) {
    return getTag(target.id)?.layerId;
  } else if (target && target instanceof Cesium3DTileFeature) {
    return getTag(target.tileset)?.layerId;
  }
  return undefined;
}