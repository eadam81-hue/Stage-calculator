import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Separator } from "../components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Box, Ruler, Upload, History, ShoppingCart, Download, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const StageCalculator = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({
    width: 10,
    depth: 8,
    height: 1000  // Height in mm for metric
  });
  const [isOutdoor, setIsOutdoor] = useState(false);
  const [isMetric, setIsMetric] = useState(true); // true = meters, false = feet
  const [addValance, setAddValance] = useState(false);
  const [addSteps, setAddSteps] = useState(false);
  const [stepsQuantity, setStepsQuantity] = useState("one"); // "one" or "two"
  const [addHandrail, setAddHandrail] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: ""
  });

  // Conversion functions
  const metersToFeet = (meters) => meters * 3.28084;
  const feetToMeters = (feet) => feet / 3.28084;
  
  // Get display value based on unit system
  const getDisplayValue = (valueInMeters) => {
    return isMetric ? valueInMeters : metersToFeet(valueInMeters).toFixed(2);
  };
  
  // Get unit label
  const unitLabel = isMetric ? 'm' : 'ft';
  const heightUnitLabel = isMetric ? 'mm' : 'ft';
  const areaUnit = isMetric ? 'm²' : 'ft²';

  // Canvas drawing function for 2D plan view (top-down) with panel grid
  const drawStage = (width, depth, height, deckPanels = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Convert to numbers
    const widthM = Number(width);
    const depthM = Number(depth);

    // Calculate scale to fit with padding
    const padding = 80;
    const availableW = canvasW - padding * 2;
    const availableH = canvasH - padding * 2;
    
    const scaleX = availableW / widthM;
    const scaleY = availableH / depthM;
    const scale = Math.min(scaleX, scaleY);

    // Calculate rectangle dimensions and position (centered)
    const rectW = widthM * scale;
    const rectH = depthM * scale;
    const rectX = (canvasW - rectW) / 2;
    const rectY = (canvasH - rectH) / 2;

    // If we have deck panel info from calculation, draw individual panels
    if (deckPanels && deckPanels.panelWidth && deckPanels.panelDepth) {
      const panelW = deckPanels.panelWidth;
      const panelD = deckPanels.panelDepth;
      const panelsWide = Math.round(widthM / panelW);
      const panelsDeep = Math.round(depthM / panelD);

      // Draw individual deck panels
      for (let x = 0; x < panelsWide; x++) {
        for (let y = 0; y < panelsDeep; y++) {
          const px = rectX + (x * panelW * scale);
          const py = rectY + (y * panelD * scale);
          const pw = panelW * scale;
          const ph = panelD * scale;

          // Panel fill
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(px, py, pw, ph);

          // Panel border (black)
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, pw, ph);

          // Add subtle inner detail
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
        }
      }

      // Add panel size label in center
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelText = `${panelW.toFixed(1)}m × ${panelD.toFixed(1)}m panels`;
      ctx.fillText(labelText, rectX + rectW / 2, rectY + rectH / 2);
      
    } else {
      // Default view - solid rectangle with grid
      ctx.fillStyle = '#06b6d4';
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 3;
      ctx.fillRect(rectX, rectY, rectW, rectH);
      ctx.strokeRect(rectX, rectY, rectW, rectH);

      // Add a subtle grid pattern (1m)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      const gridSize = scale * 1;
      
      for (let i = 1; i < widthM; i++) {
        const x = rectX + i * gridSize;
        ctx.beginPath();
        ctx.moveTo(x, rectY);
        ctx.lineTo(x, rectY + rectH);
        ctx.stroke();
      }
      
      for (let i = 1; i < depthM; i++) {
        const y = rectY + i * gridSize;
        ctx.beginPath();
        ctx.moveTo(rectX, y);
        ctx.lineTo(rectX + rectW, y);
        ctx.stroke();
      }
    }

    // Add dimension lines and labels
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const unit = isMetric ? 'm' : 'ft';
    const displayWidth = isMetric ? widthM.toFixed(1) : (widthM * 3.28084).toFixed(1);
    const displayDepth = isMetric ? depthM.toFixed(1) : (depthM * 3.28084).toFixed(1);

    // Width dimension (bottom)
    const widthY = rectY + rectH + 40;
    ctx.beginPath();
    ctx.moveTo(rectX, widthY - 10);
    ctx.lineTo(rectX, widthY + 10);
    ctx.moveTo(rectX, widthY);
    ctx.lineTo(rectX + rectW, widthY);
    ctx.moveTo(rectX + rectW, widthY - 10);
    ctx.lineTo(rectX + rectW, widthY + 10);
    ctx.stroke();
    ctx.fillText(`WIDTH: ${displayWidth}${unit}`, rectX + rectW / 2, widthY + 25);

    // Depth dimension (right)
    const depthX = rectX + rectW + 40;
    ctx.beginPath();
    ctx.moveTo(depthX - 10, rectY);
    ctx.lineTo(depthX + 10, rectY);
    ctx.moveTo(depthX, rectY);
    ctx.lineTo(depthX, rectY + rectH);
    ctx.moveTo(depthX - 10, rectY + rectH);
    ctx.lineTo(depthX + 10, rectY + rectH);
    ctx.stroke();
    ctx.save();
    ctx.translate(depthX + 25, rectY + rectH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`DEPTH: ${displayDepth}${unit}`, 0, 0);
    ctx.restore();

    // Add "PLAN VIEW" label at top
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('PLAN VIEW (TOP DOWN)', canvasW / 2, 20);
  };

  // Draw stage when dimensions change (without panel details)
  useEffect(() => {
    if (canvasRef.current) {
      drawStage(dimensions.width, dimensions.depth, dimensions.height, null);
    }
  }, [dimensions.width, dimensions.depth, dimensions.height, isMetric]);

  // Update visualization after calculation with panel details
  useEffect(() => {
    if (result && canvasRef.current) {
      // Find the deck component from parts list
      const deckPart = result.parts_list.find(
        p => (p.name.toLowerCase().includes('deck') || p.name.toLowerCase().includes('panel')) 
        && !p.name.toLowerCase().includes('handrail')
      );
      
      if (deckPart && deckPart.unit_width && deckPart.unit_depth) {
        const deckPanels = {
          panelWidth: deckPart.unit_width,
          panelDepth: deckPart.unit_depth
        };
        drawStage(result.width, result.depth, result.height, deckPanels);
      }
    }
  }, [result]);

  const handleCalculate = async () => {
    if (dimensions.width <= 0 || dimensions.depth <= 0 || dimensions.height <= 0) {
      toast.error("All dimensions must be greater than 0");
      return;
    }

    setCalculating(true);
    try {
      // Always send dimensions in meters to backend
      const widthInMeters = isMetric ? parseFloat(dimensions.width) : feetToMeters(parseFloat(dimensions.width));
      const depthInMeters = isMetric ? parseFloat(dimensions.depth) : feetToMeters(parseFloat(dimensions.depth));
      // Height: convert mm to meters for metric, or feet to meters for imperial
      const heightInMeters = isMetric ? parseFloat(dimensions.height) / 1000 : feetToMeters(parseFloat(dimensions.height));
      
      const response = await axios.post(`${API}/calculate`, {
        width: widthInMeters,
        depth: depthInMeters,
        height: heightInMeters,
        location_type: isOutdoor ? "outdoor" : "indoor",
        add_valance: addValance,
        add_steps: addSteps,
        steps_quantity: stepsQuantity,
        add_handrail: addHandrail
      });
      
      setResult(response.data);
      toast.success("Stage calculated successfully!");
    } catch (error) {
      console.error("Calculation error:", error);
      toast.error(error.response?.data?.detail || "Failed to calculate stage");
    } finally {
      setCalculating(false);
    }
  };

  const handleAddToCart = async () => {
    if (!result) return;
    
    setAddingToCart(true);
    try {
      const cartItems = result.parts_list.map(part => ({
        sku: part.sku || null,
        name: part.name,
        quantity: part.quantity_used,
        price: part.unit_price,
        weight: part.unit_weight
      }));

      const response = await axios.post(`${API}/cart/add`, {
        items: cartItems,
        calculation_id: result.id
      });

      toast.success(`Added ${response.data.total_items} items to cart (£${response.data.total_price.toFixed(2)})`);
    } catch (error) {
      console.error("Cart error:", error);
      toast.error("Failed to add to cart");
    } finally {
      setAddingToCart(false);
    }
  };

  const handleSaveQuote = async () => {
    if (!result) return;
    
    if (!quoteForm.name || !quoteForm.email) {
      toast.error("Please fill in name and email");
      return;
    }

    setSavingQuote(true);
    try {
      const response = await axios.post(`${API}/quote/save`, {
        calculation_id: result.id,
        customer_name: quoteForm.name,
        customer_email: quoteForm.email,
        customer_phone: quoteForm.phone || null,
        notes: quoteForm.notes || null
      });

      toast.success("Quote saved successfully!");
      
      // Download PDF
      window.open(`${API}/quote/${response.data.quote_id}/pdf`, '_blank');
      
      setQuoteDialogOpen(false);
      setQuoteForm({ name: "", email: "", phone: "", notes: "" });
    } catch (error) {
      console.error("Quote error:", error);
      toast.error("Failed to save quote");
    } finally {
      setSavingQuote(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-5xl font-bold gradient-text mb-2">Stage Builder</h1>
            <p className="text-slate-600 text-lg">Design your perfect stage with precision</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/components')}
              data-testid="manage-components-btn"
            >
              <Upload className="mr-2 h-4 w-4" />
              Manage Components
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/history')}
              data-testid="view-history-btn"
            >
              <History className="mr-2 h-4 w-4" />
              History
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Input Form */}
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-cyan-600" />
                  Stage Dimensions
                </CardTitle>
                <CardDescription>Enter your stage measurements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Unit Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label htmlFor="unit-toggle" className="text-base font-medium">
                      Unit System
                    </Label>
                    <p className="text-sm text-slate-500 mt-1">
                      {isMetric ? "Metric (meters)" : "Imperial (feet)"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${isMetric ? 'text-cyan-600' : 'text-slate-400'}`}>
                      Meters
                    </span>
                    <Switch
                      id="unit-toggle"
                      checked={!isMetric}
                      onCheckedChange={(checked) => setIsMetric(!checked)}
                      data-testid="unit-toggle"
                    />
                    <span className={`text-sm font-medium ${!isMetric ? 'text-cyan-600' : 'text-slate-400'}`}>
                      Feet
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="width">Width ({unitLabel})</Label>
                  <Input
                    id="width"
                    type="number"
                    step={isMetric ? "0.1" : "1"}
                    min={isMetric ? "0.1" : "1"}
                    value={dimensions.width}
                    onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                    data-testid="width-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="depth">Depth ({unitLabel})</Label>
                  <Input
                    id="depth"
                    type="number"
                    step={isMetric ? "0.1" : "1"}
                    min={isMetric ? "0.1" : "1"}
                    value={dimensions.depth}
                    onChange={(e) => setDimensions({ ...dimensions, depth: e.target.value })}
                    data-testid="depth-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="height">Height ({heightUnitLabel})</Label>
                  <Input
                    id="height"
                    type="number"
                    step={isMetric ? "10" : "1"}
                    min={isMetric ? "100" : "1"}
                    value={dimensions.height}
                    onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })}
                    data-testid="height-input"
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label htmlFor="outdoor-mode" className="text-base font-medium">
                      Outdoor Installation
                    </Label>
                    <p className="text-sm text-slate-500 mt-1">
                      Adds leg savers and base jacks for levelling the platform on uneven ground
                    </p>
                  </div>
                  <Switch
                    id="outdoor-mode"
                    checked={isOutdoor}
                    onCheckedChange={setIsOutdoor}
                    data-testid="outdoor-switch"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label htmlFor="valance-mode" className="text-base font-medium">
                      Add Stage Valance
                    </Label>
                    <p className="text-sm text-slate-500 mt-1">
                      A black fabric stage skirt that covers the front edge of the platform
                    </p>
                  </div>
                  <Switch
                    id="valance-mode"
                    checked={addValance}
                    onCheckedChange={setAddValance}
                    data-testid="valance-switch"
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="steps-mode" className="text-base font-medium">
                        Add Steps
                      </Label>
                      <p className="text-sm text-slate-500 mt-1">
                        Access steps for the stage platform
                      </p>
                    </div>
                    <Switch
                      id="steps-mode"
                      checked={addSteps}
                      onCheckedChange={setAddSteps}
                      data-testid="steps-switch"
                    />
                  </div>
                  {addSteps && (
                    <div className="space-y-2 pl-4 border-l-2 border-slate-300">
                      <Label htmlFor="steps-quantity" className="text-sm font-medium">
                        Number of Step Sets
                      </Label>
                      <Select value={stepsQuantity} onValueChange={setStepsQuantity}>
                        <SelectTrigger id="steps-quantity" data-testid="steps-quantity-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one">One Set</SelectItem>
                          <SelectItem value="two">Two Sets (both sides)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label htmlFor="handrail-mode" className="text-base font-medium">
                      Add Handrail
                    </Label>
                    <p className="text-sm text-slate-500 mt-1">
                      Safety handrail around back and sides
                    </p>
                  </div>
                  <Switch
                    id="handrail-mode"
                    checked={addHandrail}
                    onCheckedChange={setAddHandrail}
                    data-testid="handrail-switch"
                  />
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600"
                  size="lg"
                  onClick={handleCalculate}
                  disabled={calculating}
                  data-testid="calculate-btn"
                >
                  {calculating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Box className="mr-2 h-5 w-5" />
                      Calculate Stage
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Visualization */}
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-cyan-600" />
                  2D Stage Visualization
                </CardTitle>
                <CardDescription>
                  2D plan view showing stage footprint
                </CardDescription>
              </CardHeader>
              <CardContent>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={400}
                  className="w-full bg-slate-50 rounded-lg"
                  data-testid="stage-canvas"
                />
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500 mb-1">Dimensions</p>
                    <p className="text-base font-semibold text-slate-900">
                      Width × Depth × Height
                    </p>
                    <p className="text-sm text-slate-700 mt-1">
                      {dimensions.width}m ({(dimensions.width * 3.28084).toFixed(2)}ft) × {dimensions.depth}m ({(dimensions.depth * 3.28084).toFixed(2)}ft) × {isMetric ? dimensions.height + 'mm' : dimensions.height + 'ft'} ({isMetric ? (dimensions.height / 304.8).toFixed(2) + 'ft' : (dimensions.height * 304.8).toFixed(0) + 'mm'})
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Area</p>
                      <p className="text-xl font-semibold text-slate-900">
                        {(dimensions.width * dimensions.depth).toFixed(2)}{areaUnit}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Build Location</p>
                      <p className="text-xl font-semibold text-slate-900">
                        {isOutdoor ? "Outdoor" : "Indoor"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <Card className="glass-card mt-8">
            <CardHeader>
              <CardTitle>Parts List</CardTitle>
              <CardDescription>
                Components required for your {result.location_type} stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Height adjustment warning for valance */}
              {result.height_adjusted_for_valance && result.requested_height && (
                <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg" data-testid="height-adjustment-warning">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900">Height Adjusted for Valance</h3>
                      <p className="mt-1 text-sm text-blue-800">
                        The requested height of <strong>{(result.requested_height * 1000).toFixed(0)}mm</strong> has been adjusted to <strong>{(result.height * 1000).toFixed(0)}mm</strong> to match available valance options and corresponding stage legs.
                      </p>
                      <p className="mt-2 text-sm text-blue-800">
                        This ensures proper fit between the valance skirt and stage platform.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning banner if dimensions don't match */}
              {result.requested_width && result.requested_depth && 
               (Math.abs(result.width - result.requested_width) > 0.1 || 
                Math.abs(result.depth - result.requested_depth) > 0.1) && (
                <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-lg" data-testid="dimension-warning">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-900">Dimension Adjustment</h3>
                      <p className="mt-1 text-sm text-amber-800">
                        The requested size ({result.requested_width}m × {result.requested_depth}m) isn't achievable with standard stage components. 
                        I've calculated the closest dimensions based on available stock: <strong>{result.width.toFixed(2)}m × {result.depth.toFixed(2)}m</strong>.
                      </p>
                      <p className="mt-2 text-sm text-amber-800">
                        Contact one of the team for a custom quote if this design doesn't meet your needs.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Name</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Unit Weight (kg)</TableHead>
                      <TableHead className="text-right">Total Price</TableHead>
                      <TableHead className="text-right">Total Weight (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.parts_list.map((part, index) => (
                      <TableRow 
                        key={index} 
                        data-testid={`part-row-${index}`}
                      >
                        <TableCell className="font-medium">
                          {part.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {part.quantity_used}
                        </TableCell>
                        <TableCell className="text-right">
                          £{part.unit_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {part.unit_weight.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          £{part.total_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {part.total_weight.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-slate-50">
                      <TableCell colSpan={4}>TOTALS</TableCell>
                      <TableCell className="text-right" data-testid="total-price">
                        £{result.total_price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right" data-testid="total-weight">
                        {result.total_weight.toFixed(2)} kg
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600"
                  size="lg"
                  data-testid="add-to-cart-btn"
                >
                  {addingToCart ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Add Entire Stage to Cart (£{result.total_price.toFixed(2)})
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => setQuoteDialogOpen(true)}
                  variant="outline"
                  size="lg"
                  data-testid="save-quote-btn"
                >
                  <Save className="mr-2 h-5 w-5" />
                  Save Quote
                </Button>
              </div>

              <p className="text-sm text-slate-500 text-center mt-3">
                Add all components to your shopping cart or save this quote for later
              </p>
            </CardContent>
          </Card>
        )}

        {/* Quote Dialog */}
        <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
          <DialogContent data-testid="quote-dialog">
            <DialogHeader>
              <DialogTitle>Save Your Quote</DialogTitle>
              <DialogDescription>
                Enter your details to save this quote and receive a PDF copy
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quote-name">Name *</Label>
                <Input
                  id="quote-name"
                  value={quoteForm.name}
                  onChange={(e) => setQuoteForm({ ...quoteForm, name: e.target.value })}
                  placeholder="John Smith"
                  data-testid="quote-name-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quote-email">Email *</Label>
                <Input
                  id="quote-email"
                  type="email"
                  value={quoteForm.email}
                  onChange={(e) => setQuoteForm({ ...quoteForm, email: e.target.value })}
                  placeholder="john@example.com"
                  data-testid="quote-email-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quote-phone">Phone (optional)</Label>
                <Input
                  id="quote-phone"
                  type="tel"
                  value={quoteForm.phone}
                  onChange={(e) => setQuoteForm({ ...quoteForm, phone: e.target.value })}
                  placeholder="+44 20 1234 5678"
                  data-testid="quote-phone-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quote-notes">Additional Notes (optional)</Label>
                <Input
                  id="quote-notes"
                  value={quoteForm.notes}
                  onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                  placeholder="Any special requirements..."
                  data-testid="quote-notes-input"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setQuoteDialogOpen(false)}
                data-testid="quote-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveQuote}
                disabled={savingQuote}
                data-testid="quote-save-btn"
              >
                {savingQuote ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Save & Download PDF
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default StageCalculator;