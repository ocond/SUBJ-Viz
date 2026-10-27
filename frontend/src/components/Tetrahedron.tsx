import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { INK, MUTED, resolveColor } from "../lib/colors";
import {
  baseBarycentric,
  massesAtUncertainty,
  projectToSimplex,
  TETRA_HEIGHT,
  TETRAHEDRON,
  toCartesian3,
  triangleGrid,
} from "../lib/geometry";
import { fromMasses, setUncertainty } from "../lib/opinion";
import type { Opinion } from "../lib/types";
import { Label, labelElement } from "./Label";
import type { Overlay, SimplexPoint, SimplexViewProps } from "./simplex";
import { pointRows } from "./Triangle";
import { Tooltip, TooltipRows, type TooltipState } from "./Tooltip";

const TARGET = new THREE.Vector3(0, TETRA_HEIGHT * 0.25, 0);
const BASE_GRID = triangleGrid().map(([from, to]) => [[...from, 0], [...to, 0]]);
const round = (v: number) => Math.round(v * 1000) / 1000;

type DragTarget = "point" | "baseRate";

interface Pick {
  id: string;
  target: DragTarget;
}

interface SceneApi {
  rebuild: (points: SimplexPoint[], overlays: Overlay[], labels: string[], vertexColors?: string[]) => void;
}

const vec = (m: number[]) => new THREE.Vector3(...toCartesian3(m));
const pointMasses = (opinion: Opinion) => [...opinion.belief, opinion.uncertainty];
const baseRateMasses = (opinion: Opinion) => [...opinion.baseRate, 0];

function label(text: string, className: string, position: THREE.Vector3, keyColor?: string) {
  const element = document.createElement("div");
  element.className = className;
  if (keyColor) {
    const key = document.createElement("span");
    key.className = "vertex-key";
    key.style.background = keyColor;
    element.append(key);
  }
  element.append(labelElement(text));
  const object = new CSS2DObject(element);
  object.position.copy(position);
  return object;
}

function line(from: THREE.Vector3, to: THREE.Vector3, color: string, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.025, gapSize: 0.018 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const object = new THREE.Line(geometry, material);
  if (dashed) object.computeLineDistances();
  return object;
}

function outlined(radius: number, fill: string, outline: string) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshBasicMaterial({ color: fill })));
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.45, 24, 16),
      new THREE.MeshBasicMaterial({ color: outline, side: THREE.BackSide }),
    ),
  );
  return group;
}

function disposeTree(object: THREE.Object3D) {
  object.traverse((child) => {
    // CSS2DObjects only remove their element when removed themselves, not with their parent
    if (child instanceof CSS2DObject) child.element.remove();
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

/** Opinion tetrahedron of a trinomial domain with draggable opinions and base rates. */
export function Tetrahedron({ labels, vertexColors, points, overlays = [], onChange, ariaLabel }: SimplexViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const propsRef = useRef({ points, onChange, labels });
  propsRef.current = { points, onChange, labels };
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const container = containerRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = "tetra-canvas";
    container.prepend(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = "tetra-labels";
    container.prepend(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(1.05, 1.15, 2.1);
    let content = new THREE.Group();
    scene.add(content);
    let pickables: THREE.Object3D[] = [];

    const render = () => {
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag: (Pick & { vertical: boolean }) | null = null;

    const setRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };

    const pick = (event: PointerEvent): Pick | null => {
      setRay(event);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      return hit ? (hit.object.userData as Pick) : null;
    };

    const hover = (event: PointerEvent, found: Pick | null) => {
      const point = found && propsRef.current.points.find((p) => p.id === found.id);
      if (!point) {
        setTooltip(null);
        return;
      }
      const rect = container.getBoundingClientRect();
      const rows =
        found.target === "baseRate"
          ? point.opinion.baseRate.map((a, i) => ({ label: `a(${propsRef.current.labels[i]})`, value: a.toFixed(3) }))
          : pointRows(point, propsRef.current.labels);
      setTooltip({
        x: event.clientX - rect.left + 14,
        y: event.clientY - rect.top + 14,
        content: <TooltipRows title={<Label text={point.label} />} rows={rows} />,
      });
    };

    const dragTo = (event: PointerEvent) => {
      if (!drag) return;
      const { points: current, onChange: change } = propsRef.current;
      const point = current.find((p) => p.id === drag!.id);
      if (!point || !change) return;
      setRay(event);
      const hitPoint = new THREE.Vector3();

      if (drag.target === "baseRate") {
        if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPoint)) return;
        const a = projectToSimplex(baseBarycentric(hitPoint.x, hitPoint.z)).map(round);
        const total = a.reduce((s, v) => s + v, 0);
        change(point.id, { ...point.opinion, baseRate: a.map((v) => v / total) });
        return;
      }

      const u = point.opinion.uncertainty;
      if (drag.vertical) {
        // Vertical plane through the point, facing the camera
        const position = vec(pointMasses(point.opinion));
        const normal = camera.position.clone().sub(position).setY(0).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, position);
        if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
        change(point.id, setUncertainty(point.opinion, round(Math.min(1, Math.max(0, hitPoint.y / TETRA_HEIGHT)))));
      } else {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -u * TETRA_HEIGHT);
        if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
        const m = massesAtUncertainty(hitPoint.x, hitPoint.z, u).map(round);
        change(point.id, fromMasses(m, point.opinion.baseRate));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const found = pick(event);
      const point = found && propsRef.current.points.find((p) => p.id === found.id);
      const draggable =
        point &&
        propsRef.current.onChange &&
        (found.target === "point" ? point.draggable : point.baseRateDraggable);
      if (!found || !draggable) return;
      controls.enabled = false;
      drag = { ...found, vertical: event.shiftKey };
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (drag) {
        dragTo(event);
        hover(event, drag);
        return;
      }
      const found = pick(event);
      const point = found && propsRef.current.points.find((p) => p.id === found.id);
      const draggable = point && (found.target === "point" ? point.draggable : point.baseRateDraggable);
      renderer.domElement.style.cursor = found ? (draggable ? "grab" : "default") : "move";
      hover(event, found);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return;
      drag = null;
      controls.enabled = true;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };

    // Registered before OrbitControls so that dragging an opinion does not rotate the view
    renderer.domElement.addEventListener("pointerdown", onPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", () => !drag && setTooltip(null));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.addEventListener("change", render);
    controls.update();

    const rebuild = (
      current: SimplexPoint[],
      currentOverlays: Overlay[],
      currentLabels: string[],
      currentVertexColors?: string[],
    ) => {
      scene.remove(content);
      disposeTree(content);
      content = new THREE.Group();
      pickables = [];

      const color = (c: string) => resolveColor(c, container);
      const ink = color(INK);
      const axis = color("var(--axis)");
      const grid = color("var(--grid)");
      const surface = color("var(--surface)");

      const corners = TETRAHEDRON.map((v) => new THREE.Vector3(...v));
      const faceGeometry = new THREE.BufferGeometry().setFromPoints([
        corners[0], corners[1], corners[2],
        corners[0], corners[1], corners[3],
        corners[1], corners[2], corners[3],
        corners[2], corners[0], corners[3],
      ]);
      content.add(
        new THREE.Mesh(
          faceGeometry,
          new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }),
        ),
      );
      for (const [from, to] of BASE_GRID) content.add(line(vec(from), vec(to), grid));
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) content.add(line(corners[i], corners[j], axis));
      }
      currentLabels.slice(0, 3).forEach((text, i) => {
        const offset = corners[i].clone().sub(new THREE.Vector3(0, 0, 0)).setY(0).multiplyScalar(0.14);
        const key = currentVertexColors && color(currentVertexColors[i]);
        content.add(label(text, "vertex-label-3d", corners[i].clone().add(offset), key));
      });
      content.add(label("u", "vertex-label-3d", corners[3].clone().add(new THREE.Vector3(0, 0.07, 0))));

      for (const overlay of currentOverlays) {
        const c = color(overlay.color ?? MUTED);
        const pts = overlay.points.map(vec);
        if (overlay.kind === "segment") {
          content.add(line(pts[0], pts[1], c, overlay.opacity ?? 0.5));
          continue;
        }
        // Polygon overlays (sub-simplices) are drawn as all edges plus translucent faces
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) content.add(line(pts[i], pts[j], c, 0.7));
        }
        const triangles: THREE.Vector3[] = [];
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++)
            for (let k = j + 1; k < pts.length; k++) triangles.push(pts[i], pts[j], pts[k]);
        content.add(
          new THREE.Mesh(
            new THREE.BufferGeometry().setFromPoints(triangles),
            new THREE.MeshBasicMaterial({
              color: c,
              transparent: true,
              opacity: overlay.opacity ?? 0.06,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          ),
        );
      }

      for (const point of current) {
        const c = color(point.color);
        const position = vec(pointMasses(point.opinion));

        if (point.showProjection && point.projection) {
          const baseRate = vec(baseRateMasses(point.opinion));
          const projection = vec([...point.projection, 0]);
          content.add(line(corners[3], baseRate, c, 0.35));
          content.add(line(position, projection, c, 0.85, true));
          const marker = outlined(0.011, surface, c);
          marker.position.copy(projection);
          content.add(marker);
        }

        if (point.showBaseRate) {
          const baseRate = vec(baseRateMasses(point.opinion));
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.018, 0.04, 16),
            new THREE.MeshBasicMaterial({ color: point.role === "result" ? ink : c }),
          );
          cone.position.copy(baseRate).add(new THREE.Vector3(0, 0.02, 0));
          content.add(cone);
          if (point.baseRateDraggable) {
            const hit = new THREE.Mesh(
              new THREE.SphereGeometry(0.05, 12, 8),
              new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
            );
            hit.position.copy(baseRate);
            hit.userData = { id: point.id, target: "baseRate" } satisfies Pick;
            content.add(hit);
            pickables.push(hit);
          }
        }

        let marker: THREE.Object3D;
        if (point.role === "result") {
          marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.034), new THREE.MeshBasicMaterial({ color: ink }));
        } else if (point.role === "derived") {
          marker = outlined(0.014, surface, c);
        } else {
          marker = outlined(0.022, c, surface);
        }
        marker.position.copy(position);
        content.add(marker);
        content.add(label(point.label, "point-label-3d", position.clone().add(new THREE.Vector3(0, 0.055, 0))));

        const hit = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 12, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        hit.position.copy(position);
        hit.userData = { id: point.id, target: "point" } satisfies Pick;
        content.add(hit);
        pickables.push(hit);
      }

      scene.add(content);
      render();
    };

    const resize = () => {
      const width = Math.max(160, container.clientWidth);
      const height = Math.round(Math.min(460, Math.max(260, width * 0.82)));
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
      container.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    sceneRef.current = { rebuild };
    const { points: initial, labels: initialLabels } = propsRef.current;
    rebuild(initial, [], initialLabels);

    return () => {
      observer.disconnect();
      controls.dispose();
      disposeTree(content);
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  // Rebuilt on every render: points, overlays and theme colors are cheap to recreate
  useEffect(() => {
    sceneRef.current?.rebuild(points, overlays, labels, vertexColors);
  });

  return (
    <div className="simplex tetra" role="group" aria-label={ariaLabel}>
      <div className="tetra-stage" ref={containerRef}>
        {unavailable && <p className="notice">3D view unavailable (WebGL is disabled). Use the editor below.</p>}
        <Tooltip state={tooltip} />
      </div>
      <p className="hint">
        Drag a point to move it at constant uncertainty · Shift + drag changes its uncertainty · drag the
        background to rotate
      </p>
    </div>
  );
}
