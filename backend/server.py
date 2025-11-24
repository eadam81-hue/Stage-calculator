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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ComponentCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    quantity: int
    price: float
    weight: float

class CalculationRequest(BaseModel):
    width: float
    depth: float
    height: float
    location_type: str  # "indoor" or "outdoor"

class CalculatedPart(BaseModel):
    name: str
    quantity_used: int
    unit_price: float
    unit_weight: float
    total_price: float
    total_weight: float

class Calculation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    width: float
    depth: float
    height: float
    location_type: str
    parts_list: List[CalculatedPart]
    total_price: float
    total_weight: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Routes
@api_router.get("/")
async def root():
    return {"message": "Stage Calculator API"}


@api_router.post("/components/upload")
async def upload_components(file: UploadFile = File(...)):
    """Upload Excel file with components (Name, Quantity, Price, Weight)"""
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
                    
                name, quantity, price, weight = row[0], row[1], row[2], row[3]
                
                if not all([name, quantity is not None, price is not None, weight is not None]):
                    errors.append(f"Row {row_idx}: Missing required fields")
                    continue
                
                component = Component(
                    name=str(name),
                    quantity=int(quantity),
                    price=float(price),
                    weight=float(weight)
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
    """Calculate stage parts based on dimensions and available components"""
    try:
        # Get all available components
        components = await db.components.find({}, {"_id": 0}).to_list(1000)
        
        if not components:
            raise HTTPException(status_code=400, detail="No components available. Please upload components first.")
        
        # Calculate stage volume and area
        volume = request.width * request.depth * request.height
        area = request.width * request.depth
        
        # Basic calculation algorithm (user will provide actual equations later)
        # This is a placeholder that distributes parts based on dimensions
        parts_list = []
        total_price = 0
        total_weight = 0
        
        for component in components:
            # Simple algorithm: calculate quantity based on area and volume
            # For outdoor, use 20% more materials (weather protection factor)
            multiplier = 1.2 if request.location_type == "outdoor" else 1.0
            
            # Example calculation (this will be replaced with actual equations)
            if "deck" in component['name'].lower() or "platform" in component['name'].lower():
                quantity_used = max(1, int((area / 4) * multiplier))
            elif "support" in component['name'].lower() or "leg" in component['name'].lower():
                quantity_used = max(4, int((request.height / 0.5) * 4 * multiplier))
            elif "frame" in component['name'].lower() or "beam" in component['name'].lower():
                perimeter = 2 * (request.width + request.depth)
                quantity_used = max(1, int((perimeter / 2) * multiplier))
            else:
                # Generic calculation based on volume
                quantity_used = max(1, int((volume / 10) * multiplier))
            
            # Ensure we don't use more than available
            quantity_used = min(quantity_used, component['quantity'])
            
            if quantity_used > 0:
                total_part_price = quantity_used * component['price']
                total_part_weight = quantity_used * component['weight']
                
                parts_list.append(CalculatedPart(
                    name=component['name'],
                    quantity_used=quantity_used,
                    unit_price=component['price'],
                    unit_weight=component['weight'],
                    total_price=total_part_price,
                    total_weight=total_part_weight
                ))
                
                total_price += total_part_price
                total_weight += total_part_weight
        
        # Create calculation record
        calculation = Calculation(
            width=request.width,
            depth=request.depth,
            height=request.height,
            location_type=request.location_type,
            parts_list=parts_list,
            total_price=round(total_price, 2),
            total_weight=round(total_weight, 2)
        )
        
        # Save to database
        doc = calculation.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['parts_list'] = [part.model_dump() for part in parts_list]
        
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