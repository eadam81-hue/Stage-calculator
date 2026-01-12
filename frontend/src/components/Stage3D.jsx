import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const Stage3D = ({ 
  width, 
  height, 
  depth, 
  deckType = 'litedeck',
  deckConfig = { width: 2.44, depth: 1.22, panelsWide: 4, panelsDeep: 3 },
  isOutdoor = false,
  showHandrail = false,
  showSteps = false,
  showValance = false
}) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.3);
    pointLight.position.set(-10, 10, -5);
    scene.add(pointLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xe2e8f0,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -height - 0.025;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x94a3b8, 0xcbd5e1);
    gridHelper.position.y = -height - 0.024;
    scene.add(gridHelper);

    // Build the stage
    buildStage(scene, { width, height, depth, deckType, deckConfig, isOutdoor, showHandrail, showSteps, showValance });

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [width, height, depth, deckType, deckConfig, isOutdoor, showHandrail, showSteps, showValance]);

  return <div ref={containerRef} className="w-full h-[400px] bg-slate-100 rounded-lg overflow-hidden" />;
};

// Function to build the stage geometry
function buildStage(scene, config) {
  const { width, height, depth, deckType, deckConfig, isOutdoor, showHandrail, showSteps, showValance } = config;
  const { width: panelW, depth: panelD, panelsWide, panelsDeep } = deckConfig;
  
  const totalWidth = panelsWide * panelW;
  const totalDepth = panelsDeep * panelD;
  const startX = -totalWidth / 2;
  const startZ = -totalDepth / 2;

  // Deck panel material
  const deckColor = deckType === 'aludeck' ? 0x0891b2 : 0x06b6d4;
  const deckMaterial = new THREE.MeshStandardMaterial({ 
    color: deckColor,
    metalness: 0.3,
    roughness: 0.7
  });

  // Create deck panels
  for (let x = 0; x < panelsWide; x++) {
    for (let z = 0; z < panelsDeep; z++) {
      const panelGeometry = new THREE.BoxGeometry(panelW - 0.02, 0.05, panelD - 0.02);
      const panel = new THREE.Mesh(panelGeometry, deckMaterial);
      panel.position.set(
        startX + x * panelW + panelW / 2,
        0,
        startZ + z * panelD + panelD / 2
      );
      panel.castShadow = true;
      panel.receiveShadow = true;
      scene.add(panel);

      // Add edge lines for better visibility
      const edges = new THREE.EdgesGeometry(panelGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0e7490, linewidth: 1 });
      const line = new THREE.LineSegments(edges, lineMaterial);
      panel.add(line);
    }
  }

  // Create legs
  const legMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x64748b,
    metalness: 0.8,
    roughness: 0.2
  });
  const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, height, 16);

  if (isOutdoor) {
    // Outdoor: legs at grid intersections
    for (let x = 0; x <= panelsWide; x++) {
      for (let z = 0; z <= panelsDeep; z++) {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(
          startX + x * panelW,
          -height / 2 - 0.025,
          startZ + z * panelD
        );
        leg.castShadow = true;
        scene.add(leg);
      }
    }
  } else {
    // Indoor: 4 legs per panel
    const offset = 0.2;
    for (let x = 0; x < panelsWide; x++) {
      for (let z = 0; z < panelsDeep; z++) {
        const panelX = startX + x * panelW;
        const panelZ = startZ + z * panelD;
        
        const positions = [
          [panelX + offset, panelZ + offset],
          [panelX + panelW - offset, panelZ + offset],
          [panelX + offset, panelZ + panelD - offset],
          [panelX + panelW - offset, panelZ + panelD - offset]
        ];

        positions.forEach(([legX, legZ]) => {
          const leg = new THREE.Mesh(legGeometry, legMaterial);
          leg.position.set(legX, -height / 2 - 0.025, legZ);
          leg.castShadow = true;
          scene.add(leg);
        });
      }
    }
  }

  // Add handrails
  if (showHandrail) {
    const handrailMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x94a3b8,
      metalness: 0.6,
      roughness: 0.3
    });
    const railHeight = height + 1.0;
    const halfW = totalWidth / 2;
    const halfD = totalDepth / 2;

    const rails = [
      { start: [-halfW, -halfD], end: [halfW, -halfD] },  // Back
      { start: [-halfW, -halfD], end: [-halfW, halfD] },  // Left
      { start: [halfW, -halfD], end: [halfW, halfD] }     // Right
    ];

    rails.forEach(({ start, end }) => {
      const length = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2));
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
      const midX = (start[0] + end[0]) / 2;
      const midZ = (start[1] + end[1]) / 2;

      // Top rail
      const railGeometry = new THREE.BoxGeometry(length, 0.05, 0.05);
      const rail = new THREE.Mesh(railGeometry, handrailMaterial);
      rail.position.set(midX, railHeight, midZ);
      rail.rotation.y = angle;
      rail.castShadow = true;
      scene.add(rail);

      // Posts
      const postGeometry = new THREE.CylinderGeometry(0.03, 0.03, railHeight, 16);
      [start, end].forEach(([x, z]) => {
        const post = new THREE.Mesh(postGeometry, handrailMaterial);
        post.position.set(x, railHeight / 2, z);
        post.castShadow = true;
        scene.add(post);
      });
    });
  }

  // Add steps
  if (showSteps) {
    const stepMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0891b2,
      metalness: 0.3,
      roughness: 0.7
    });

    // Lower step
    const step1Geometry = new THREE.BoxGeometry(1.2, height / 4, 0.4);
    const step1 = new THREE.Mesh(step1Geometry, stepMaterial);
    step1.position.set(0, -height * 0.75, totalDepth / 2 + 0.6);
    step1.castShadow = true;
    step1.receiveShadow = true;
    scene.add(step1);

    // Upper step
    const step2Geometry = new THREE.BoxGeometry(1.2, height / 2, 0.4);
    const step2 = new THREE.Mesh(step2Geometry, stepMaterial);
    step2.position.set(0, -height / 4, totalDepth / 2 + 0.3);
    step2.castShadow = true;
    step2.receiveShadow = true;
    scene.add(step2);
  }

  // Add valance
  if (showValance) {
    const valanceMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1e293b,
      metalness: 0.1,
      roughness: 0.9
    });
    const valanceGeometry = new THREE.BoxGeometry(totalWidth, height, 0.02);
    const valance = new THREE.Mesh(valanceGeometry, valanceMaterial);
    valance.position.set(0, -height / 2 - 0.025, -totalDepth / 2);
    valance.receiveShadow = true;
    scene.add(valance);
  }
}

export default Stage3D;
