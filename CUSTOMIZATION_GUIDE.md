# Stage Calculator Customization Guide

## Overview

The Stage Calculator application is fully functional and ready to use. The calculation algorithm currently uses a basic placeholder logic that can be easily replaced with your specific equations.

## Current Calculation Logic

The system currently uses these rules (located in `/app/backend/server.py` in the `calculate_stage` function):

1. **Deck/Platform Components**: Quantity based on stage area (area / 4)
2. **Support/Leg Components**: Quantity based on height (height / 0.5 × 4)
3. **Frame/Beam Components**: Quantity based on perimeter ((width + depth) × 2 / 2)
4. **Other Components**: Quantity based on volume (volume / 10)
5. **Outdoor Multiplier**: All quantities multiplied by 1.2 for outdoor installations

## How to Customize Equations

### Step 1: Locate the Calculation Function

Open `/app/backend/server.py` and find the `calculate_stage` function (around line 155).

### Step 2: Replace the Algorithm

Replace the calculation logic with your specific equations. Here's the structure:

```python
for component in components:
    # Your custom equation here
    # Example: quantity_used = your_formula(request.width, request.depth, request.height)
    
    if request.location_type == "outdoor":
        quantity_used = int(quantity_used * 1.2)  # Outdoor multiplier
    
    quantity_used = min(quantity_used, component['quantity'])  # Don't exceed inventory
```

### Step 3: Example Custom Equations

```python
# Example 1: Area-based calculation
if "deck" in component['name'].lower():
    area = request.width * request.depth
    quantity_used = int(area / component_coverage_area)

# Example 2: Height-based calculation  
elif "support" in component['name'].lower():
    supports_per_meter = 2
    total_supports = int(request.height * supports_per_meter * 4)
    quantity_used = total_supports

# Example 3: Complex formula
elif "frame" in component['name'].lower():
    perimeter = 2 * (request.width + request.depth)
    frame_sections = int(perimeter / 2.5)  # 2.5m sections
    quantity_used = frame_sections
```

### Step 4: Testing Your Equations

After updating the equations:

1. Save the file
2. Restart the backend: `sudo supervisorctl restart backend`
3. Test with various dimensions
4. Verify the parts list matches your expectations

## Indoor vs Outdoor Equations

You can implement completely different equations for indoor vs outdoor:

```python
if request.location_type == "outdoor":
    # Outdoor-specific calculation
    quantity_used = calculate_outdoor(component, dimensions)
else:
    # Indoor-specific calculation
    quantity_used = calculate_indoor(component, dimensions)
```

## Component Detection

The system automatically detects component types based on keywords in the component name:

- **Deck/Platform**: Keywords like "deck", "platform"
- **Support/Leg**: Keywords like "support", "leg"  
- **Frame/Beam**: Keywords like "frame", "beam"
- **Custom**: Add your own keyword detection logic

## Adding Metadata to Components

You can extend the component model to include additional fields like:

```python
class Component(BaseModel):
    # Existing fields
    name: str
    quantity: int
    price: float
    weight: float
    
    # New fields you can add
    coverage_area: Optional[float] = None
    component_type: Optional[str] = None
    material: Optional[str] = None
```

## Need Help?

The current implementation is a fully working starting point. Simply replace the calculation logic in the `calculate_stage` function with your specific formulas, and the rest of the system will work seamlessly.
