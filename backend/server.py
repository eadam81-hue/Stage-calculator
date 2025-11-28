from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import openpyxl
import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class Component(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sku: Optional[str] = None
    quantity: int
    price: float
    weight: float
    width: float  # Width dimension in meters
    depth: float  # Depth dimension in meters
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ComponentCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    quantity: int
    price: float
    weight: float
    width: float
    depth: float

class CalculationRequest(BaseModel):
    width: float
    depth: float
    height: float
    location_type: str  # "indoor" or "outdoor"
    add_valance: bool = False  # Add stage valance
    add_steps: bool = False  # Add steps
    steps_quantity: str = "one"  # "one" or "two"
    add_handrail: bool = False  # Add handrail

class CalculatedPart(BaseModel):
    name: str
    quantity_used: int
    unit_price: float
    unit_weight: float
    total_price: float
    total_weight: float
    has_shortfall: bool = False
    available_quantity: int = 0

class Calculation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    width: float  # Actual achieved width
    depth: float  # Actual achieved depth
    height: float
    location_type: str
    requested_width: Optional[float] = None  # Original requested width
    requested_depth: Optional[float] = None  # Original requested depth
    requested_height: Optional[float] = None  # Original requested height
    height_adjusted_for_valance: bool = False
    handrail_recommendation: Optional[str] = None
    parts_list: List[CalculatedPart]
    total_price: float
    total_weight: float
    has_inventory_issues: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Routes
@api_router.get("/")
async def root():
    return {"message": "Stage Calculator API"}


@api_router.post("/components/upload")
async def upload_components(file: UploadFile = File(...)):
    """Upload Excel file with components (Name, SKU, Quantity, Price, Weight, Width, Depth)"""
    try:
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Only Excel files are allowed")
        
        # Read the file
        contents = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contents))
        ws = wb.active
        
        components_added = 0
        errors = []
        
        # Skip header row, start from row 2
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            try:
                if not any(row):  # Skip empty rows
                    continue
                
                # Extract values: Name, SKU, Quantity, Price, Weight, Width, Depth
                name = row[0]
                sku = row[1] if len(row) > 1 else None
                quantity = row[2] if len(row) > 2 else None
                price = row[3] if len(row) > 3 else None
                weight = row[4] if len(row) > 4 else None
                width = row[5] if len(row) > 5 else None
                depth = row[6] if len(row) > 6 else None
                
                if not all([name, quantity is not None, price is not None, weight is not None, width is not None, depth is not None]):
                    errors.append(f"Row {row_idx}: Missing required fields (Name, Quantity, Price, Weight, Width, Depth)")
                    continue
                
                component = Component(
                    name=str(name),
                    sku=str(sku) if sku else None,
                    quantity=int(quantity),
                    price=float(price),
                    weight=float(weight),
                    width=float(width),
                    depth=float(depth)
                )
                
                doc = component.model_dump()
                doc['created_at'] = doc['created_at'].isoformat()
                
                await db.components.insert_one(doc)
                components_added += 1
                
            except (ValueError, TypeError, IndexError) as e:
                errors.append(f"Row {row_idx}: Invalid data format - {str(e)}")
                continue
        
        return {
            "success": True,
            "components_added": components_added,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@api_router.get("/components", response_model=List[Component])
async def get_components():
    """Get all components"""
    components = await db.components.find({}, {"_id": 0}).to_list(1000)
    
    for comp in components:
        if isinstance(comp['created_at'], str):
            comp['created_at'] = datetime.fromisoformat(comp['created_at'])
    
    return components


@api_router.delete("/components/{component_id}")
async def delete_component(component_id: str):
    """Delete a component"""
    result = await db.components.delete_one({"id": component_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Component not found")
    
    return {"success": True, "message": "Component deleted"}


@api_router.delete("/components")
async def delete_all_components():
    """Delete all components"""
    result = await db.components.delete_many({})
    return {"success": True, "deleted_count": result.deleted_count}


@api_router.post("/calculate", response_model=Calculation)
async def calculate_stage(request: CalculationRequest):
    """Calculate stage parts based on available components to match requested dimensions"""
    try:
        # Get all available components
        components = await db.components.find({}, {"_id": 0}).to_list(1000)
        
        if not components:
            raise HTTPException(status_code=400, detail="No components available. Please upload components first.")
        
        # Sort components by area (largest first) for better fitting
        components_sorted = sorted(components, key=lambda x: x['width'] * x['depth'], reverse=True)
        
        # Determine actual stage height (may be adjusted for valance)
        actual_stage_height = request.height
        height_adjusted_for_valance = False
        
        # If valance is requested and height < 760mm, adjust height to match available valance
        # This applies to BOTH indoor and outdoor installations
        if request.add_valance and request.height < 0.76:
            # Find valance/casement components
            valance_components = [c for c in components if 'valance' in c['name'].lower() or 'casement' in c['name'].lower()]
            
            if valance_components:
                # Find valance with closest matching height to requested
                best_valance_for_height = None
                best_height_diff = float('inf')
                
                for valance in valance_components:
                    valance_height = valance['depth']
                    height_diff = abs(valance_height - request.height)
                    
                    if height_diff < best_height_diff:
                        best_height_diff = height_diff
                        best_valance_for_height = valance
                
                if best_valance_for_height:
                    # Adjust stage height to match valance (for both indoor and outdoor)
                    actual_stage_height = best_valance_for_height['depth']
                    height_adjusted_for_valance = True
                    logger.info(f"Height adjusted from {request.height}m to {actual_stage_height}m to match valance")
        
        # ONLY calculate deck/platform components - ignore height, legs, frames, connectors
        target_width = request.width
        target_depth = request.depth
        
        used_components = []
        actual_width = 0
        actual_depth = 0
        
        # Find ONLY deck/platform/panel components, sorted by area (largest first)
        deck_components = [c for c in components_sorted if 'deck' in c['name'].lower() or 'platform' in c['name'].lower() or 'panel' in c['name'].lower()]
        
        if not deck_components:
            raise HTTPException(status_code=400, detail="No deck/platform components found. Please upload deck components to build a stage.")
        
        # STRATEGY: Check if dimensions are whole numbers (metric) AND divisible by Aludeck 2x1m
        # If yes, prioritize Aludeck 2x1m for exact fit
        # Otherwise, use largest panels (Litedeck) first
        
        is_metric_whole_numbers = (target_width == int(target_width)) and (target_depth == int(target_depth))
        
        # Separate Aludeck and other deck types
        aludeck_components = [c for c in deck_components if 'aludeck' in c['name'].lower()]
        other_deck_components = [c for c in deck_components if 'aludeck' not in c['name'].lower()]
        
        # Check if Aludeck can achieve exact dimensions
        can_use_aludeck_exactly = False
        if is_metric_whole_numbers and aludeck_components:
            # Check if dimensions are divisible by Aludeck panel size (2m × 1m)
            aludeck = aludeck_components[0]
            aludeck_width = aludeck['width']  # 2m
            aludeck_depth = aludeck['depth']  # 1m
            
            # Check if we can achieve exact dimensions with Aludeck panels
            # ONLY check normal orientation (2m wide × 1m deep) for Aludeck priority
            # Don't rely on rotation for primary deck selection
            can_use_aludeck_exactly = (target_width % aludeck_width == 0) and (target_depth % aludeck_depth == 0)
        
        # Prioritize based on dimensions AND location type
        # NEVER use Aludeck for outdoor installations
        if request.location_type == "outdoor":
            # Outdoor: ONLY use Litedeck (or other non-Aludeck decks)
            if other_deck_components:
                deck_components_prioritized = other_deck_components
                logger.info(f"Outdoor: Excluding Aludeck, using Litedeck for {target_width}m × {target_depth}m")
            else:
                raise HTTPException(status_code=400, detail="No suitable outdoor deck components found. Aludeck cannot be used for outdoor installations.")
        elif can_use_aludeck_exactly:
            # Indoor with exact metric dimensions: Use Aludeck first
            deck_components_prioritized = aludeck_components + other_deck_components
            logger.info(f"Indoor: Using Aludeck priority for {target_width}m × {target_depth}m")
        else:
            # Indoor with non-exact dimensions: Use largest panels first, excluding Aludeck
            if other_deck_components:
                deck_components_prioritized = other_deck_components
                logger.info(f"Indoor: Excluding Aludeck, using {len(other_deck_components)} other deck types for {target_width}m × {target_depth}m")
            else:
                deck_components_prioritized = deck_components
                logger.info(f"No other deck options, using all {len(deck_components)} deck types")
        
        # Step 1: Use the PRIORITIZED panels as the base
        primary_deck = deck_components_prioritized[0]  # Aludeck if metric whole numbers, otherwise largest
        logger.info(f"Primary deck selected: {primary_deck['name']}")
        primary_width = primary_deck['width']
        primary_depth = primary_deck['depth']
        
        # Calculate how many primary panels fit
        panels_across = int(target_width / primary_width)
        panels_deep = int(target_depth / primary_depth)
        
        # Try adding one more row/column to get closer
        test_configs = [
            (panels_across, panels_deep),
            (panels_across + 1, panels_deep),
            (panels_across, panels_deep + 1),
            (panels_across + 1, panels_deep + 1)
        ]
        
        best_config = None
        best_diff = float('inf')
        
        for pa, pd in test_configs:
            total = pa * pd
            if total == 0:
                continue
            
            # Don't check inventory here - calculate what's NEEDED
            # We'll detect shortfalls later when building parts list
            
            test_w = pa * primary_width
            test_d = pd * primary_depth
            
            diff = abs(test_w - target_width) + abs(test_d - target_depth)
            
            # Slight penalty for oversizing
            if test_w > target_width:
                diff += 0.5
            if test_d > target_depth:
                diff += 0.5
            
            if diff < best_diff:
                best_diff = diff
                best_config = (pa, pd, test_w, test_d, total)
        
        if best_config:
            panels_across, panels_deep, width_covered, depth_covered, primary_qty = best_config
            
            used_components.append({
                'component': primary_deck,
                'quantity': primary_qty
            })
            
            actual_width = width_covered
            actual_depth = depth_covered
            
            # Track total deck panels for leg calculation
            total_deck_panels = primary_qty
            
            # Step 2: Fill remaining gaps with smaller panels (if available and needed)
            if len(deck_components_prioritized) > 1:
                remaining_width = target_width - width_covered
                remaining_depth = target_depth - depth_covered
                
                # Check if we have a significant gap (more than 10cm)
                if remaining_width > 0.1 or remaining_depth > 0.1:
                    # Try to use smaller panels to fill the gap
                    for secondary_deck in deck_components_prioritized[1:]:
                        sec_width = secondary_deck['width']
                        sec_depth = secondary_deck['depth']
                        
                        # Try to fill the depth gap (most common scenario)
                        # Check if panel width matches primary AND it helps cover the depth gap
                        if remaining_depth > 0.1 and abs(sec_width - primary_width) < 0.1:
                            # Panel has same width - can add a row
                            # Even if it overshoots, it gets us closer to target
                            if sec_depth > 0:
                                # Would adding this row get us closer to the target?
                                new_depth = depth_covered + sec_depth
                                current_diff = abs(target_depth - depth_covered)
                                new_diff = abs(target_depth - new_depth)
                                
                                # Only add if it improves the fit or gets very close
                                if new_diff < current_diff or abs(new_depth - target_depth) < 0.2:
                                    # Calculate how many we need across the width
                                    sec_panels_needed = panels_across
                                    
                                    # Add what's needed (don't check inventory yet)
                                    used_components.append({
                                        'component': secondary_deck,
                                        'quantity': sec_panels_needed
                                    })
                                    actual_depth = new_depth
                                    total_deck_panels += sec_panels_needed
                                    break
                        
                        # Try to fill the width gap
                        elif remaining_width > 0.1 and abs(sec_depth - primary_depth) < 0.1:
                            # Panel has same depth - can add a column
                            if sec_width > 0:
                                new_width = width_covered + sec_width
                                current_diff = abs(target_width - width_covered)
                                new_diff = abs(target_width - new_width)
                                
                                if new_diff < current_diff or abs(new_width - target_width) < 0.2:
                                    sec_panels_needed = panels_deep
                                    
                                    # Add what's needed (don't check inventory yet)
                                    used_components.append({
                                        'component': secondary_deck,
                                        'quantity': sec_panels_needed
                                    })
                                    actual_width = new_width
                                    total_deck_panels += sec_panels_needed
                                    break
        else:
            # Fallback: use at least 1 primary panel
            used_components.append({
                'component': primary_deck,
                'quantity': 1
            })
            actual_width = primary_deck['width']
            actual_depth = primary_deck['depth']
            total_deck_panels = 1
        
        # Step 3: Add stage legs (different logic for indoor vs outdoor)
        # Find stage leg components
        leg_components = [c for c in components if 'stage leg' in c['name'].lower()]
        
        if leg_components:
            # Calculate required leg length from stage height
            # Finished deck height = leg length + 25mm
            # So: leg length = requested height - 25mm
            requested_height_mm = actual_stage_height * 1000  # Convert meters to mm
            required_leg_length_mm = requested_height_mm - 25
            required_leg_length_m = required_leg_length_mm / 1000  # Back to meters
            
            # Find the leg with closest matching length
            best_leg = None
            best_diff = float('inf')
            
            for leg in leg_components:
                leg_length = max(leg['width'], leg['depth'])
                diff = abs(leg_length - required_leg_length_m)
                
                if diff < best_diff:
                    best_diff = diff
                    best_leg = leg
            
            if best_leg:
                if request.location_type == "indoor":
                    # INDOOR: Simple calculation - 4 legs per deck panel
                    legs_needed = total_deck_panels * 4
                    
                    used_components.append({
                        'component': best_leg,
                        'quantity': legs_needed
                    })
                    
                else:
                    # OUTDOOR: Complex grid-based calculation
                    # Calculate grid dimensions (panels across × panels deep)
                    # This depends on how panels are laid out
                    import math
                    
                    # Estimate panels in each direction based on actual dimensions
                    primary_deck = deck_components_prioritized[0]
                    panel_width = primary_deck['width']
                    panel_depth = primary_deck['depth']
                    
                    panels_across = max(1, round(actual_width / panel_width))
                    panels_deep = max(1, round(actual_depth / panel_depth))
                    
                    # Total legs for outdoor = (panels_across + 1) × (panels_deep + 1)
                    # This creates a grid of leg positions
                    legs_needed = (panels_across + 1) * (panels_deep + 1)
                    
                    used_components.append({
                        'component': best_leg,
                        'quantity': legs_needed
                    })
                    
                    # Add leg savers for outdoor
                    leg_saver_components = [c for c in components if 'leg saver' in c['name'].lower() or 'legsaver' in c['name'].lower()]
                    
                    if leg_saver_components:
                        leg_saver = leg_saver_components[0]
                        
                        # Leg saver calculation based on the pattern
                        # Back row: first deck (3 savers) + middle decks (2 each) + last deck (1)
                        # Middle rows: first deck (2 savers) + middle decks (1 each) + last deck (0)
                        # Front row: first deck (1 saver) + middle decks (1 each) + last deck (0)
                        
                        leg_savers_needed = 0
                        
                        # Back row
                        leg_savers_needed += 3  # First deck
                        leg_savers_needed += 2 * (panels_across - 2) if panels_across > 2 else 0  # Middle decks
                        leg_savers_needed += 1  # Last deck
                        
                        # Middle rows
                        for row in range(1, panels_deep - 1):
                            leg_savers_needed += 2  # First deck
                            leg_savers_needed += 1 * (panels_across - 1) if panels_across > 1 else 0  # Remaining decks
                        
                        # Front row (if more than 1 row)
                        if panels_deep > 1:
                            leg_savers_needed += 1  # First deck
                            leg_savers_needed += 1 * (panels_across - 2) if panels_across > 2 else 0  # Middle decks
                            # Last deck has 0 savers
                        
                        used_components.append({
                            'component': leg_saver,
                            'quantity': leg_savers_needed
                        })
                    
                    # Add base jacks for outdoor (1 per leg)
                    base_jack_components = [c for c in components if 'base jack' in c['name'].lower() or 'basejack' in c['name'].lower()]
                    
                    if base_jack_components:
                        base_jack = base_jack_components[0]
                        used_components.append({
                            'component': base_jack,
                            'quantity': legs_needed
                        })
                    
                    # Add wooden pads for outdoor (1 per leg)
                    wooden_pad_components = [c for c in components if 'wooden pad' in c['name'].lower() or 'wood pad' in c['name'].lower()]
                    
                    if wooden_pad_components:
                        wooden_pad = wooden_pad_components[0]
                        used_components.append({
                            'component': wooden_pad,
                            'quantity': legs_needed
                        })
        
        # Step 4: Add stage valance if requested
        if request.add_valance:
            # Find valance/casement components (Black Cotton Casement for tall stages)
            valance_components = [c for c in components if 'valance' in c['name'].lower() or 'casement' in c['name'].lower()]
            
            if valance_components:
                # Find valance with closest matching height
                required_valance_height_m = actual_stage_height
                best_valance = None
                best_height_diff = float('inf')
                
                for valance in valance_components:
                    # Valance height is typically stored in depth dimension
                    valance_height = valance['depth']
                    height_diff = abs(valance_height - required_valance_height_m)
                    
                    if height_diff < best_height_diff:
                        best_height_diff = height_diff
                        best_valance = valance
                
                if best_valance:
                    # Calculate widest side of the stage
                    widest_dimension = max(actual_width, actual_depth)
                    
                    # Valance width (length of each panel)
                    valance_panel_width = best_valance['width']
                    
                    # Calculate how many panels needed to cover the widest side
                    # Always round UP to ensure full coverage (slightly more, not less)
                    import math
                    valance_panels_needed = math.ceil(widest_dimension / valance_panel_width)
                    
                    if valance_panels_needed > 0:
                        used_components.append({
                            'component': best_valance,
                            'quantity': valance_panels_needed
                        })
        
        # Step 5: Add steps if requested
        steps_added_count = 0  # Track for handrail calculation
        if request.add_steps:
            import math
            height_mm = actual_stage_height * 1000
            
            # Determine step type based on height
            if height_mm < 300:
                # No steps needed for stages below 300mm
                pass
            elif 300 <= height_mm < 600:
                # Custom platform builds for low stages
                if 300 <= height_mm < 450:  # ~1ft / 370mm
                    # Add Litedeck 4×2 + 4× 165mm legs
                    litedeck_4x2 = [c for c in components if 'litedeck 4x2' in c['name'].lower() or ('litedeck' in c['name'].lower() and '1.22' in str(c['width']) and '0.61' in str(c['depth']))]
                    leg_165mm = [c for c in components if '165' in c['name'].lower() and 'leg' in c['name'].lower()]
                    
                    sets_needed = 2 if request.steps_quantity == "two" else 1
                    
                    if litedeck_4x2:
                        used_components.append({'component': litedeck_4x2[0], 'quantity': sets_needed})
                    if leg_165mm:
                        used_components.append({'component': leg_165mm[0], 'quantity': 4 * sets_needed})
                    steps_added_count = sets_needed
                    
                elif 450 <= height_mm < 600:  # ~1.5ft / 570mm
                    # Add Litedeck 4×4 + Litedeck 4×2 + 8× 165mm legs per set
                    litedeck_4x4 = [c for c in components if 'litedeck 4x4' in c['name'].lower() or ('litedeck' in c['name'].lower() and '1.22' in str(c['width']) and '1.22' in str(c['depth']))]
                    litedeck_4x2 = [c for c in components if 'litedeck 4x2' in c['name'].lower() or ('litedeck' in c['name'].lower() and '1.22' in str(c['width']) and '0.61' in str(c['depth']))]
                    leg_165mm = [c for c in components if '165' in c['name'].lower() and 'leg' in c['name'].lower()]
                    
                    sets_needed = 2 if request.steps_quantity == "two" else 1
                    
                    if litedeck_4x4:
                        used_components.append({'component': litedeck_4x4[0], 'quantity': sets_needed})
                    if litedeck_4x2:
                        used_components.append({'component': litedeck_4x2[0], 'quantity': sets_needed})
                    if leg_165mm:
                        used_components.append({'component': leg_165mm[0], 'quantity': 8 * sets_needed})
                    steps_added_count = sets_needed
                    
            elif 600 <= height_mm <= 1000:
                # Adjustable Stage Treads: 600-1000mm
                step_components = [c for c in components if 'adjustable' in c['name'].lower() and 'tread' in c['name'].lower() and '600' in c['name'].lower()]
                if step_components:
                    sets_needed = 2 if request.steps_quantity == "two" else 1
                    used_components.append({'component': step_components[0], 'quantity': sets_needed})
                    steps_added_count = sets_needed
                    
            elif 1000 < height_mm <= 1800:
                # Adjustable Stage Treads: 1000-1800mm
                step_components = [c for c in components if 'adjustable' in c['name'].lower() and 'tread' in c['name'].lower() and '1000' in c['name'].lower()]
                if step_components:
                    sets_needed = 2 if request.steps_quantity == "two" else 1
                    used_components.append({'component': step_components[0], 'quantity': sets_needed})
                    steps_added_count = sets_needed
        
        # Step 6: Add handrail if requested
        handrail_recommendation = None
        if request.add_handrail:
            import math
            
            # Calculate perimeter (back + both sides, NOT front)
            back_length = actual_width
            side_length = actual_depth
            total_perimeter = back_length + (2 * side_length)
            
            # Determine handrail type based on deck type
            if 'aludeck' in deck_components_prioritized[0]['name'].lower():
                # Metric decking - use 2m and 1m handrail
                handrail_2m = [c for c in components if 'handrail' in c['name'].lower() and '2m' in c['name'].lower()]
                handrail_1m = [c for c in components if 'handrail' in c['name'].lower() and '1m' in c['name'].lower()]
                
                if handrail_2m or handrail_1m:
                    # Calculate optimal combination
                    panels_2m = int(total_perimeter / 2.0)
                    remaining = total_perimeter - (panels_2m * 2.0)
                    panels_1m = math.ceil(remaining / 1.0)
                    
                    if handrail_2m and panels_2m > 0:
                        used_components.append({'component': handrail_2m[0], 'quantity': panels_2m})
                    if handrail_1m and panels_1m > 0:
                        used_components.append({'component': handrail_1m[0], 'quantity': panels_1m})
            else:
                # Imperial decking - use 8ft and 4ft handrail
                handrail_8ft = [c for c in components if 'handrail' in c['name'].lower() and '8ft' in c['name'].lower()]
                handrail_4ft = [c for c in components if 'handrail' in c['name'].lower() and '4ft' in c['name'].lower()]
                
                if handrail_8ft or handrail_4ft:
                    # Calculate optimal combination for each side separately
                    # Convert to feet for imperial handrail
                    back_length_ft = back_length * 3.28084
                    side_length_ft = side_length * 3.28084
                    
                    logger.info(f"Handrail calc: back={back_length_ft:.2f}ft, side={side_length_ft:.2f}ft")
                    
                    total_8ft = 0
                    total_4ft = 0
                    
                    # Calculate for back
                    back_8ft = int(back_length_ft / 8.0)
                    back_remaining = back_length_ft - (back_8ft * 8.0)
                    back_4ft = math.ceil(back_remaining / 4.0) if back_remaining > 0 else 0
                    
                    logger.info(f"Back: {back_8ft}x8ft + {back_4ft}x4ft (remaining: {back_remaining:.2f}ft)")
                    
                    total_8ft += back_8ft
                    total_4ft += back_4ft
                    
                    # Calculate for each side (2 sides)
                    for i in range(2):
                        side_8ft = int(side_length_ft / 8.0)
                        side_remaining = side_length_ft - (side_8ft * 8.0)
                        side_4ft = math.ceil(side_remaining / 4.0) if side_remaining > 0 else 0
                        
                        logger.info(f"Side {i+1}: {side_8ft}x8ft + {side_4ft}x4ft (remaining: {side_remaining:.2f}ft)")
                        
                        total_8ft += side_8ft
                        total_4ft += side_4ft
                    
                    logger.info(f"Handrail total BEFORE steps adjustment: {total_8ft}x8ft + {total_4ft}x4ft")
                    
                    # Adjust for steps: each step set replaces one 4ft section
                    total_4ft_adjusted = max(0, total_4ft - steps_added_count)
                    
                    # If we removed more 4ft panels than we had, convert 8ft to 4ft
                    if total_4ft_adjusted == 0 and steps_added_count > total_4ft:
                        deficit = steps_added_count - total_4ft
                        if deficit > 0 and total_8ft > 0:
                            total_8ft -= deficit
                            total_4ft_adjusted += deficit
                    
                    if handrail_8ft and total_8ft > 0:
                        used_components.append({'component': handrail_8ft[0], 'quantity': total_8ft})
                    if handrail_4ft and total_4ft_adjusted > 0:
                        used_components.append({'component': handrail_4ft[0], 'quantity': total_4ft_adjusted})
        
        # Check if handrail is recommended for safety (stages > 570mm)
        if not request.add_handrail and actual_stage_height > 0.57:
            handrail_recommendation = "For stages over 570mm, we recommend adding handrail to improve safety."
        
        # Build parts list and check for inventory shortfalls
        parts_list = []
        total_price = 0
        total_weight = 0
        has_inventory_issues = False
        
        for item in used_components:
            comp = item['component']
            qty_needed = item['quantity']
            qty_available = comp['quantity']
            
            # Check if there's a shortfall
            has_shortfall = qty_needed > qty_available
            if has_shortfall:
                has_inventory_issues = True
            
            total_part_price = qty_needed * comp['price']
            total_part_weight = qty_needed * comp['weight']
            
            parts_list.append(CalculatedPart(
                name=comp['name'],
                quantity_used=qty_needed,
                unit_price=comp['price'],
                unit_weight=comp['weight'],
                total_price=total_part_price,
                total_weight=total_part_weight,
                has_shortfall=has_shortfall,
                available_quantity=qty_available
            ))
            
            total_price += total_part_price
            total_weight += total_part_weight
        
        # Create calculation record with actual dimensions achieved
        calculation = Calculation(
            width=actual_width if actual_width > 0 else request.width,
            depth=actual_depth if actual_depth > 0 else request.depth,
            height=actual_stage_height,
            location_type=request.location_type,
            requested_width=request.width,
            requested_depth=request.depth,
            requested_height=request.height,
            height_adjusted_for_valance=height_adjusted_for_valance,
            handrail_recommendation=handrail_recommendation,
            parts_list=parts_list,
            total_price=round(total_price, 2),
            total_weight=round(total_weight, 2),
            has_inventory_issues=has_inventory_issues
        )
        
        # Save to database
        doc = calculation.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['parts_list'] = [part.model_dump() for part in parts_list]
        doc['requested_width'] = request.width  # Store original request
        doc['requested_depth'] = request.depth
        doc['actual_width'] = actual_width if actual_width > 0 else request.width
        doc['actual_depth'] = actual_depth if actual_depth > 0 else request.depth
        
        await db.calculations.insert_one(doc)
        
        return calculation
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")


@api_router.get("/calculations", response_model=List[Calculation])
async def get_calculations():
    """Get calculation history"""
    calculations = await db.calculations.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    for calc in calculations:
        if isinstance(calc['created_at'], str):
            calc['created_at'] = datetime.fromisoformat(calc['created_at'])
    
    return calculations


# Cart Models and Endpoints
class CartItem(BaseModel):
    sku: Optional[str] = None
    name: str
    quantity: int
    price: float
    weight: float

class AddToCartRequest(BaseModel):
    items: List[CartItem]
    calculation_id: str

class Cart(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    items: List[CartItem]
    total_price: float
    total_weight: float
    calculation_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post("/cart/add")
async def add_to_cart(request: AddToCartRequest):
    """Add calculation parts to cart"""
    try:
        total_price = sum(item.price * item.quantity for item in request.items)
        total_weight = sum(item.weight * item.quantity for item in request.items)
        
        cart = Cart(
            items=request.items,
            total_price=total_price,
            total_weight=total_weight,
            calculation_id=request.calculation_id
        )
        
        doc = cart.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['items'] = [item.model_dump() for item in request.items]
        
        await db.carts.insert_one(doc)
        
        return {
            "success": True,
            "cart_id": cart.id,
            "message": f"Added {len(request.items)} items to cart",
            "total_price": total_price,
            "total_items": sum(item.quantity for item in request.items)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding to cart: {str(e)}")


@api_router.get("/cart/{cart_id}")
async def get_cart(cart_id: str):
    """Retrieve cart by ID"""
    cart = await db.carts.find_one({"id": cart_id}, {"_id": 0})
    
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    if isinstance(cart['created_at'], str):
        cart['created_at'] = datetime.fromisoformat(cart['created_at'])
    
    return cart


# Quote Models and Endpoints
class SaveQuoteRequest(BaseModel):
    calculation_id: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    notes: Optional[str] = None

class Quote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    calculation_id: str
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    stage_width: float
    stage_depth: float
    stage_height: float
    location_type: str
    parts_list: List[CalculatedPart]
    total_price: float
    total_weight: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post("/quote/save")
async def save_quote(request: SaveQuoteRequest):
    """Save quote with customer details"""
    try:
        # Get the calculation
        calc = await db.calculations.find_one({"id": request.calculation_id}, {"_id": 0})
        
        if not calc:
            raise HTTPException(status_code=404, detail="Calculation not found")
        
        quote = Quote(
            calculation_id=request.calculation_id,
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            customer_phone=request.customer_phone,
            notes=request.notes,
            stage_width=calc['width'],
            stage_depth=calc['depth'],
            stage_height=calc['height'],
            location_type=calc['location_type'],
            parts_list=calc['parts_list'],
            total_price=calc['total_price'],
            total_weight=calc['total_weight']
        )
        
        doc = quote.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.quotes.insert_one(doc)
        
        return {
            "success": True,
            "quote_id": quote.id,
            "message": "Quote saved successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving quote: {str(e)}")


@api_router.get("/quote/{quote_id}/pdf")
async def download_quote_pdf(quote_id: str):
    """Generate and download quote as PDF"""
    try:
        quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
        
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Create PDF in memory
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#0891b2'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        elements.append(Paragraph("Stage Builder Quote", title_style))
        elements.append(Spacer(1, 0.3*inch))
        
        # Customer Details
        elements.append(Paragraph(f"<b>Customer:</b> {quote['customer_name']}", styles['Normal']))
        elements.append(Paragraph(f"<b>Email:</b> {quote['customer_email']}", styles['Normal']))
        if quote.get('customer_phone'):
            elements.append(Paragraph(f"<b>Phone:</b> {quote['customer_phone']}", styles['Normal']))
        elements.append(Spacer(1, 0.2*inch))
        
        # Stage Dimensions
        elements.append(Paragraph("<b>Stage Specifications</b>", styles['Heading2']))
        elements.append(Paragraph(f"Dimensions: {quote['stage_width']}m × {quote['stage_depth']}m × {quote['stage_height']}m", styles['Normal']))
        elements.append(Paragraph(f"Location: {quote['location_type'].title()}", styles['Normal']))
        elements.append(Paragraph(f"Total Area: {quote['stage_width'] * quote['stage_depth']:.2f}m²", styles['Normal']))
        elements.append(Spacer(1, 0.3*inch))
        
        # Parts List Table
        elements.append(Paragraph("<b>Parts List</b>", styles['Heading2']))
        
        table_data = [['Part Name', 'Quantity', 'Unit Price', 'Total Price', 'Weight']]
        for part in quote['parts_list']:
            table_data.append([
                part['name'],
                str(part['quantity_used']),
                f"£{part['unit_price']:.2f}",
                f"£{part['total_price']:.2f}",
                f"{part['total_weight']:.2f}kg"
            ])
        
        # Totals row
        table_data.append([
            'TOTAL',
            '',
            '',
            f"£{quote['total_price']:.2f}",
            f"{quote['total_weight']:.2f}kg"
        ])
        
        table = Table(table_data, colWidths=[2.5*inch, 1*inch, 1*inch, 1*inch, 1*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0891b2')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e0f2fe')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ]))
        elements.append(table)
        
        if quote.get('notes'):
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("<b>Notes:</b>", styles['Normal']))
            elements.append(Paragraph(quote['notes'], styles['Normal']))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=quote_{quote_id}.pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@api_router.get("/quotes", response_model=List[Quote])
async def get_quotes():
    """Get all saved quotes"""
    quotes = await db.quotes.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    for quote in quotes:
        if isinstance(quote['created_at'], str):
            quote['created_at'] = datetime.fromisoformat(quote['created_at'])
    
    return quotes


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()