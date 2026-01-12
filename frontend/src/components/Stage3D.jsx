import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import { useMemo } from 'react';

// Individual deck panel component
const DeckPanel = ({ position, size, type }) => {
  const color = type === 'aludeck' ? '#0891b2' : '#06b6d4';
  
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={[size.width, 0.05, size.depth]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.7} />
    </mesh>
  );
};

// Leg component
const Leg = ({ position, height }) => {
  return (
    <mesh position={[position[0], -height / 2 - 0.025, position[1]]} castShadow>
      <cylinderGeometry args={[0.05, 0.05, height, 16]} />
      <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
    </mesh>
  );
};

// Handrail component
const Handrail = ({ start, end, height }) => {
  const length = Math.sqrt(
    Math.pow(end[0] - start[0], 2) + Math.pow(end[2] - start[2], 2)
  );
  const angle = Math.atan2(end[2] - start[2], end[0] - start[0]);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  return (
    <group>
      {/* Top rail */}
      <mesh
        position={[midX, height, midZ]}
        rotation={[0, angle, 0]}
        castShadow
      >
        <boxGeometry args={[length, 0.05, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>
      
      {/* Post at start */}
      <mesh position={[start[0], height / 2, start[2]]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, height, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>
      
      {/* Post at end */}
      <mesh position={[end[0], height / 2, end[2]]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, height, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
};

// Steps component
const Steps = ({ position, width, height }) => {
  return (
    <group position={position}>
      <mesh position={[0, -height / 4, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[width, height / 2, 0.4]} />
        <meshStandardMaterial color="#0891b2" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[0, -height * 0.75, 0.6]} castShadow receiveShadow>
        <boxGeometry args={[width, height / 4, 0.4]} />
        <meshStandardMaterial color="#0891b2" metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  );
};

// Valance component
const Valance = ({ width, height, depth }) => {
  return (
    <mesh position={[0, -height / 2 - 0.025, -depth / 2]} receiveShadow>
      <boxGeometry args={[width, height, 0.02]} />
      <meshStandardMaterial color="#1e293b" metalness={0.1} roughness={0.9} />
    </mesh>
  );
};

// Main Stage 3D Scene
const Stage3DScene = ({ 
  width, 
  height, 
  depth, 
  deckType = 'litedeck',
  deckConfig = { width: 2.44, depth: 1.22, panelsWide: 4, panelsDeep: 3 },
  showLegs = true,
  isOutdoor = false,
  showHandrail = false,
  showSteps = false,
  showValance = false
}) => {
  // Calculate deck panels layout
  const deckPanels = useMemo(() => {
    const panels = [];
    const { width: panelW, depth: panelD, panelsWide, panelsDeep } = deckConfig;
    const totalWidth = panelsWide * panelW;
    const totalDepth = panelsDeep * panelD;
    const startX = -totalWidth / 2;
    const startZ = -totalDepth / 2;

    for (let x = 0; x < panelsWide; x++) {
      for (let z = 0; z < panelsDeep; z++) {
        panels.push({
          position: [
            startX + x * panelW + panelW / 2,
            0,
            startZ + z * panelD + panelD / 2
          ],
          size: { width: panelW, depth: panelD }
        });
      }
    }
    return panels;
  }, [deckConfig]);

  // Calculate leg positions
  const legs = useMemo(() => {
    const legPositions = [];
    const { width: panelW, depth: panelD, panelsWide, panelsDeep } = deckConfig;
    const totalWidth = panelsWide * panelW;
    const totalDepth = panelsDeep * panelD;
    const startX = -totalWidth / 2;
    const startZ = -totalDepth / 2;

    if (isOutdoor) {
      // Outdoor: legs at grid intersections
      for (let x = 0; x <= panelsWide; x++) {
        for (let z = 0; z <= panelsDeep; z++) {
          legPositions.push([
            startX + x * panelW,
            startZ + z * panelD
          ]);
        }
      }
    } else {
      // Indoor: 4 legs per panel
      for (let x = 0; x < panelsWide; x++) {
        for (let z = 0; z < panelsDeep; z++) {
          const panelX = startX + x * panelW;
          const panelZ = startZ + z * panelD;
          const offset = 0.2; // Offset from panel edge
          
          legPositions.push([panelX + offset, panelZ + offset]);
          legPositions.push([panelX + panelW - offset, panelZ + offset]);
          legPositions.push([panelX + offset, panelZ + panelD - offset]);
          legPositions.push([panelX + panelW - offset, panelZ + panelD - offset]);
        }
      }
    }
    return legPositions;
  }, [deckConfig, isOutdoor]);

  // Calculate handrail positions (back + 2 sides)
  const handrails = useMemo(() => {
    if (!showHandrail) return [];
    
    const { width: panelW, depth: panelD, panelsWide, panelsDeep } = deckConfig;
    const totalWidth = panelsWide * panelW;
    const totalDepth = panelsDeep * panelD;
    const halfW = totalWidth / 2;
    const halfD = totalDepth / 2;
    const railHeight = height + 1.0; // 1m above stage

    return [
      // Back rail
      { start: [-halfW, 0, -halfD], end: [halfW, 0, -halfD], height: railHeight },
      // Left rail
      { start: [-halfW, 0, -halfD], end: [-halfW, 0, halfD], height: railHeight },
      // Right rail
      { start: [halfW, 0, -halfD], end: [halfW, 0, halfD], height: railHeight }
    ];
  }, [showHandrail, deckConfig, height]);

  const stageWidth = deckConfig.panelsWide * deckConfig.width;
  const stageDepth = deckConfig.panelsDeep * deckConfig.depth;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-10, 10, -5]} intensity={0.5} />

      {/* Deck panels */}
      {deckPanels.map((panel, i) => (
        <DeckPanel
          key={i}
          position={panel.position}
          size={panel.size}
          type={deckType}
        />
      ))}

      {/* Legs */}
      {showLegs && legs.map((pos, i) => (
        <Leg key={i} position={pos} height={height} />
      ))}

      {/* Handrails */}
      {handrails.map((rail, i) => (
        <Handrail
          key={i}
          start={rail.start}
          end={rail.end}
          height={rail.height}
        />
      ))}

      {/* Steps */}
      {showSteps && (
        <Steps
          position={[0, 0, stageDepth / 2 + 0.4]}
          width={1.2}
          height={height}
        />
      )}

      {/* Valance */}
      {showValance && (
        <Valance
          width={stageWidth}
          height={height}
          depth={stageDepth}
        />
      )}

      {/* Ground grid */}
      <Grid
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#94a3b8"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeDistance={30}
        fadeStrength={1}
        position={[0, -height - 0.025, 0]}
      />
    </>
  );
};

// Main exported component
const Stage3D = ({ 
  width, 
  height, 
  depth, 
  deckType,
  deckConfig,
  isOutdoor,
  showHandrail,
  showSteps,
  showValance
}) => {
  return (
    <div className="w-full h-[400px] bg-slate-100 rounded-lg overflow-hidden">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[8, 6, 8]} fov={50} />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={5}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2}
        />
        <Stage3DScene
          width={width}
          height={height}
          depth={depth}
          deckType={deckType}
          deckConfig={deckConfig}
          showLegs={true}
          isOutdoor={isOutdoor}
          showHandrail={showHandrail}
          showSteps={showSteps}
          showValance={showValance}
        />
      </Canvas>
    </div>
  );
};

export default Stage3D;
