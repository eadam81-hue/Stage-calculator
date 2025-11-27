import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
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
    height: 1.5
  });
  const [isOutdoor, setIsOutdoor] = useState(false);
  const [isMetric, setIsMetric] = useState(true); // true = meters, false = feet
  const [addValance, setAddValance] = useState(false);
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
  const areaUnit = isMetric ? 'm²' : 'ft²';
  const volumeUnit = isMetric ? 'm³' : 'ft³';

  const drawStage = (width, depth, height, unit = 'm') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Use meter values for calculations
    const widthM = width;
    const depthM = depth;
    const heightM = height;

    // Calculate scaling factor
    const maxDim = Math.max(widthM, depthM, heightM);
    const scale = Math.min(canvasWidth, canvasHeight) * 0.4 / maxDim;

    // Isometric projection parameters
    const angle = Math.PI / 6; // 30 degrees
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Convert 3D coordinates to isometric 2D
    const toIso = (x, y, z) => {
      const isoX = (x - y) * Math.cos(angle) * scale;
      const isoY = (x + y) * Math.sin(angle) * scale - z * scale;
      return [centerX + isoX, centerY + isoY];
    };

    // Define the 8 vertices of the stage box
    const vertices = [
      [0, 0, 0],
      [widthM, 0, 0],
      [widthM, depthM, 0],
      [0, depthM, 0],
      [0, 0, heightM],
      [widthM, 0, heightM],
      [widthM, depthM, heightM],
      [0, depthM, heightM]
    ];

    const isoVertices = vertices.map(v => toIso(v[0], v[1], v[2]));

    // Draw faces
    // Top face
    ctx.fillStyle = '#0891b2';
    ctx.strokeStyle = '#0e7490';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(isoVertices[4][0], isoVertices[4][1]);
    ctx.lineTo(isoVertices[5][0], isoVertices[5][1]);
    ctx.lineTo(isoVertices[6][0], isoVertices[6][1]);
    ctx.lineTo(isoVertices[7][0], isoVertices[7][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front face
    ctx.fillStyle = '#06b6d4';
    ctx.strokeStyle = '#0891b2';
    ctx.beginPath();
    ctx.moveTo(isoVertices[1][0], isoVertices[1][1]);
    ctx.lineTo(isoVertices[2][0], isoVertices[2][1]);
    ctx.lineTo(isoVertices[6][0], isoVertices[6][1]);
    ctx.lineTo(isoVertices[5][0], isoVertices[5][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right face
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#0369a1';
    ctx.beginPath();
    ctx.moveTo(isoVertices[0][0], isoVertices[0][1]);
    ctx.lineTo(isoVertices[1][0], isoVertices[1][1]);
    ctx.lineTo(isoVertices[5][0], isoVertices[5][1]);
    ctx.lineTo(isoVertices[4][0], isoVertices[4][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Add dimension labels with unit
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    
    // Display values in user's chosen unit
    const displayWidth = isMetric ? width : metersToFeet(width).toFixed(1);
    const displayDepth = isMetric ? depth : metersToFeet(depth).toFixed(1);
    const displayHeight = isMetric ? height : metersToFeet(height).toFixed(1);
    
    // Width label
    const widthMid = [(isoVertices[4][0] + isoVertices[5][0]) / 2, isoVertices[4][1] - 20];
    ctx.fillText(`${displayWidth}${unit}`, widthMid[0], widthMid[1]);
    
    // Depth label
    const depthMid = [(isoVertices[5][0] + isoVertices[6][0]) / 2, isoVertices[5][1] - 20];
    ctx.fillText(`${displayDepth}${unit}`, depthMid[0], depthMid[1]);
    
    // Height label
    const heightMid = [isoVertices[5][0] + 30, (isoVertices[5][1] + isoVertices[1][1]) / 2];
    ctx.fillText(`${displayHeight}${unit}`, heightMid[0], heightMid[1]);

    // Add grid on top face
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    const gridSize = 1;
    for (let i = 1; i < widthM; i += gridSize) {
      const start = toIso(i, 0, heightM);
      const end = toIso(i, depthM, heightM);
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
    }
    for (let i = 1; i < depthM; i += gridSize) {
      const start = toIso(0, i, heightM);
      const end = toIso(widthM, i, heightM);
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
    }
  };

  useEffect(() => {
    drawStage(dimensions.width, dimensions.depth, dimensions.height, unitLabel);
  }, [dimensions, isMetric]);

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
      const heightInMeters = isMetric ? parseFloat(dimensions.height) : feetToMeters(parseFloat(dimensions.height));
      
      const response = await axios.post(`${API}/calculate`, {
        width: widthInMeters,
        depth: depthInMeters,
        height: heightInMeters,
        location_type: isOutdoor ? "outdoor" : "indoor",
        add_valance: addValance
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
                  <Label htmlFor="height">Height ({unitLabel})</Label>
                  <Input
                    id="height"
                    type="number"
                    step={isMetric ? "0.1" : "1"}
                    min={isMetric ? "0.1" : "1"}
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
                  3D Stage Visualization
                </CardTitle>
                <CardDescription>
                  Isometric view of your stage design
                </CardDescription>
              </CardHeader>
              <CardContent>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={400}
                  className="w-full stage-canvas"
                  data-testid="stage-canvas"
                />
                <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Volume</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {(dimensions.width * dimensions.depth * dimensions.height).toFixed(2)}{volumeUnit}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Area</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {(dimensions.width * dimensions.depth).toFixed(2)}{areaUnit}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Type</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {isOutdoor ? "Outdoor" : "Indoor"}
                    </p>
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
              {/* Inventory shortfall warning */}
              {result.has_inventory_issues && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg" data-testid="inventory-warning">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-900">Insufficient Inventory</h3>
                      <p className="mt-1 text-sm text-red-800">
                        Some components required for this stage configuration are currently out of stock or have insufficient quantities available.
                      </p>
                      <p className="mt-2 text-sm text-red-800 font-medium">
                        Please contact a member of staff for further assistance with your order.
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
                        className={part.has_shortfall ? "bg-red-50 border-l-4 border-l-red-500" : ""}
                      >
                        <TableCell className={`font-medium ${part.has_shortfall ? "text-red-900" : ""}`}>
                          {part.name}
                          {part.has_shortfall && (
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                              Insufficient Stock
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right ${part.has_shortfall ? "text-red-900 font-semibold" : ""}`}>
                          {part.quantity_used}
                          {part.has_shortfall && (
                            <span className="block text-xs text-red-600 mt-1">
                              (Available: {part.available_quantity})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right ${part.has_shortfall ? "text-red-900" : ""}`}>
                          £{part.unit_price.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right ${part.has_shortfall ? "text-red-900" : ""}`}>
                          {part.unit_weight.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right ${part.has_shortfall ? "text-red-900" : ""}`}>
                          £{part.total_price.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right ${part.has_shortfall ? "text-red-900" : ""}`}>
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