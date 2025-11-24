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
    width: float  # Actual achieved width
    depth: float  # Actual achieved depth
    height: float
    location_type: str
    requested_width: Optional[float] = None  # Original requested width
    requested_depth: Optional[float] = None  # Original requested depth
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
        
        # Try to build the stage using available components
        # This is a simplified "best fit" algorithm
        target_width = request.width
        target_depth = request.depth
        
        used_components = []
        actual_width = 0
        actual_depth = 0
        
        # Strategy: Fill width and depth with largest components first
        # This is a greedy algorithm - can be improved for optimal fit
        
        # Step 1: Find deck/platform components
        deck_components = [c for c in components_sorted if 'deck' in c['name'].lower() or 'platform' in c['name'].lower()]
        
        if deck_components:
            # Try to fill the area with deck panels
            for deck in deck_components:
                deck_width = deck['width']
                deck_depth = deck['depth']
                
                # Calculate how many panels fit in width and depth
                panels_width = int(target_width / deck_width)
                panels_depth = int(target_depth / deck_depth)
                
                # Try both orientations
                panels_needed_option1 = panels_width * panels_depth
                actual_w1 = panels_width * deck_width
                actual_d1 = panels_depth * deck_depth
                
                # Rotated orientation
                panels_width_rot = int(target_width / deck_depth)
                panels_depth_rot = int(target_depth / deck_width)
                panels_needed_option2 = panels_width_rot * panels_depth_rot
                actual_w2 = panels_width_rot * deck_depth
                actual_d2 = panels_depth_rot * deck_width
                
                # Choose the orientation that gets closer to target
                diff1 = abs(actual_w1 - target_width) + abs(actual_d1 - target_depth)
                diff2 = abs(actual_w2 - target_width) + abs(actual_d2 - target_depth)
                
                if panels_needed_option1 > 0 and (diff1 <= diff2 or panels_needed_option2 == 0):
                    panels_needed = min(panels_needed_option1, deck['quantity'])
                    actual_width = actual_w1
                    actual_depth = actual_d1
                elif panels_needed_option2 > 0:
                    panels_needed = min(panels_needed_option2, deck['quantity'])
                    actual_width = actual_w2
                    actual_depth = actual_d2
                else:
                    # Need at least 1 panel
                    panels_needed = 1
                    actual_width = deck_width
                    actual_depth = deck_depth
                
                if panels_needed > 0:
                    used_components.append({
                        'component': deck,
                        'quantity': panels_needed
                    })
                    break  # Use first deck type that fits
        else:
            # No deck components found, use any component
            if components_sorted:
                comp = components_sorted[0]
                quantity = 1
                actual_width = comp['width']
                actual_depth = comp['depth']
                used_components.append({
                    'component': comp,
                    'quantity': quantity
                })
        
        # Step 2: Add support legs (if available)
        support_components = [c for c in components if 'support' in c['name'].lower() or 'leg' in c['name'].lower()]
        if support_components and actual_width > 0 and actual_depth > 0:
            # Rule: 1 support per 2m² of stage area, minimum 4 corners
            stage_area = actual_width * actual_depth
            supports_needed = max(4, int(stage_area / 2))
            
            for support in support_components:
                supports_to_use = min(supports_needed, support['quantity'])
                if supports_to_use > 0:
                    used_components.append({
                        'component': support,
                        'quantity': supports_to_use
                    })
                    break
        
        # Step 3: Add frame/beam components (if available)
        frame_components = [c for c in components if 'frame' in c['name'].lower() or 'beam' in c['name'].lower()]
        if frame_components and actual_width > 0 and actual_depth > 0:
            perimeter = 2 * (actual_width + actual_depth)
            
            for frame in frame_components:
                beam_length = max(frame['width'], frame['depth'])
                if beam_length > 0:
                    beams_needed = max(1, int(perimeter / beam_length))
                    beams_to_use = min(beams_needed, frame['quantity'])
                    if beams_to_use > 0:
                        used_components.append({
                            'component': frame,
                            'quantity': beams_to_use
                        })
                        break
        
        # Step 4: Add connectors (if available)
        connector_components = [c for c in components if 'connector' in c['name'].lower() or 'bracket' in c['name'].lower()]
        if connector_components:
            # Estimate 4-8 connectors per deck panel
            total_deck_panels = sum(uc['quantity'] for uc in used_components if 'deck' in uc['component']['name'].lower())
            connectors_needed = max(4, total_deck_panels * 4)
            
            for connector in connector_components:
                connectors_to_use = min(connectors_needed, connector['quantity'])
                if connectors_to_use > 0:
                    used_components.append({
                        'component': connector,
                        'quantity': connectors_to_use
                    })
                    break
        
        # Build parts list
        parts_list = []
        total_price = 0
        total_weight = 0
        
        for item in used_components:
            comp = item['component']
            qty = item['quantity']
            
            total_part_price = qty * comp['price']
            total_part_weight = qty * comp['weight']
            
            parts_list.append(CalculatedPart(
                name=comp['name'],
                quantity_used=qty,
                unit_price=comp['price'],
                unit_weight=comp['weight'],
                total_price=total_part_price,
                total_weight=total_part_weight
            ))
            
            total_price += total_part_price
            total_weight += total_part_weight
        
        # Create calculation record with actual dimensions achieved
        calculation = Calculation(
            width=actual_width if actual_width > 0 else request.width,
            depth=actual_depth if actual_depth > 0 else request.depth,
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