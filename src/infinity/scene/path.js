(function (_) {

    /**
     * A path shape
     * @class GXPath
     * @extends GXPathBase
     * @constructor
     */
    function GXPath(closed, evenOdd, anchorPoints) {
        GXPathBase.call(this, closed, evenOdd, anchorPoints);
        this._setDefaultProperties(GXPath.GeometryProperties);
    }

    GXNode.inherit("path", GXPath, GXPathBase);

    /**
     * The geometry properties of a path with their default values
     */
    GXPath.GeometryProperties = {
        /** Closed or not */
        closed: false
    };

    /**
     * Return the anchor points of the path
     * @returns {GXPathBase.AnchorPoints}
     */
    GXPath.prototype.getAnchorPoints = function () {
        return this._firstChild;
    };

    /** @override */
    GXPath.prototype.store = function (blob) {
        if (GXPathBase.prototype.store.call(this, blob)) {
            this.storeProperties(blob, GXPath.GeometryProperties);

            // Store our anchor points
            blob.pts = this.getAnchorPoints().serialize();
            return true;
        }
        return false;
    };

    /** @override */
    GXPath.prototype.restore = function (blob) {
        if (GXPathBase.prototype.restore.call(this, blob)) {
            this.restoreProperties(blob, GXPath.GeometryProperties, true);

            // Restore our anchor points
            if (blob.hasOwnProperty('pts')) {
                this.getAnchorPoints().deserialize(blob.pts);
            }
            return true;
        }
        return false;
    };

    /** @override */
    GXPath.prototype.clone = function () {
        var clone = GXPathBase.prototype.clone.call(this);

        // Transfer selected anchor points as flags are not cloned
        var selectedAnchorPoints = this.getAnchorPoints().queryAll(':selected');
        for (var i = 0; i < selectedAnchorPoints.length; ++i) {
            var anchorPointIndex = this.getAnchorPoints().getIndexOfChild(selectedAnchorPoints[i]);
            var cloneAnchorPoint = clone.getAnchorPoints().getChildByIndex(anchorPointIndex);
            if (cloneAnchorPoint) {
                cloneAnchorPoint.setFlag(GXNode.Flag.Selected);
            }
        }

        return clone;
    };

    GXPath.prototype.hitTest = function (location, outlineWidth, area, styled) {
        var hitResult = new GXVertexInfo.HitResult();
        this._invalidateVertices(styled);
        if (gVertexInfo.hitTest(
            location.getX(), location.getY(), this, outlineWidth, area, hitResult)) {
            return hitResult;
        }
        this._verticesDurty = true;
        return null;
    };

    GXPath.prototype.insertHitPoint = function (hitResult) {
        if (!hitResult || !hitResult.slope ||
            gMath.isEqualEps(hitResult.slope, 0) || gMath.isEqualEps(hitResult.slope, 1)) {

            return null;
        }
        var slope = hitResult.slope;

        var idx = 1;
        var aPt = this.getAnchorPoints().getFirstChild();
        while (aPt != null && idx < hitResult.segment) {
            aPt = aPt.getNext();
            idx++;
        }

        var aPrev = aPt;
        var aNext = aPrev ? this.getAnchorPoints().getNextPoint(aPrev) : null;
        if (!aPrev || !aNext) {
            return null;
        } else {
            this.beginUpdate();
            aPrev.setProperty('ah', false);
            aNext.setProperty('ah', false);

            var tpaPrev = aPrev.getProperty('tp');
            var tpaNext = aNext.getProperty('tp');
            var tpaNew;
            if (tpaPrev == GXPathBase.AnchorPoint.Type.Connector ||
                tpaPrev == GXPathBase.AnchorPoint.Type.Smooth ||
                tpaNext == GXPathBase.AnchorPoint.Type.Connector ||
                tpaNext == GXPathBase.AnchorPoint.Type.Smooth ||
                (tpaPrev == GXPathBase.AnchorPoint.Type.Regular &&
                    tpaNext == GXPathBase.AnchorPoint.Type.Regular)) {

                // One of near points is smooth or both have no styled corners
                tpaNew = GXPathBase.AnchorPoint.Type.Regular;
            } else if (tpaPrev != GXPathBase.AnchorPoint.Type.Smooth &&
                tpaPrev != GXPathBase.AnchorPoint.Type.Connector &&
                tpaPrev != GXPathBase.AnchorPoint.Type.Regular) {

                // aPrev has styled corner
                tpaNew = tpaPrev;
            } else {
                // aNext has styled corner
                tpaNew = tpaNext;
            }

            var newAPt = null;
            var p1x, c1x, c2x, p2x, p1y, c1y, c2y, p2y;

            p1x = aPrev.getProperty('x');
            p1y = aPrev.getProperty('y');
            c1x = aPrev.getProperty('hrx');
            c1y = aPrev.getProperty('hry');
            if (c1x == null || c1y == null) {
                c1x = p1x;
                c1y = p1y;
            }
            p2x = aNext.getProperty('x');
            p2y = aNext.getProperty('y');
            c2x = aNext.getProperty('hlx');
            c2y = aNext.getProperty('hly');
            if (c2x == null || c2y == null) {
                c2x = p2x;
                c2y = p2y;
            }

            // If line
            if (gMath.isEqualEps(c1x, p1x) && gMath.isEqualEps(c1y, p1y) &&
                gMath.isEqualEps(c2x, p2x) && gMath.isEqualEps(c2y, p2y)) {

                newAPt = new GXPath.AnchorPoint();
                newAPt.setProperties(['x', 'y', 'tp'],
                    [p1x + slope * (p2x - p1x), p1y + slope * (p2y - p1y), tpaNew]);
                this.getAnchorPoints().insertChild(newAPt, aNext);
            } else { // curve
                var ctrls1X = new Float64Array(4);
                var ctrls1Y = new Float64Array(4);
                var ctrls2X = new Float64Array(4);
                var ctrls2Y = new Float64Array(4);

                gMath.getCtrlPtsCasteljau(p1x, c1x, c2x, p2x, slope, 1, ctrls1X);
                gMath.getCtrlPtsCasteljau(p1y, c1y, c2y, p2y, slope, 1, ctrls1Y);
                gMath.getCtrlPtsCasteljau(p1x, c1x, c2x, p2x, slope, 2, ctrls2X);
                gMath.getCtrlPtsCasteljau(p1y, c1y, c2y, p2y, slope, 2, ctrls2Y);

                if (gMath.isEqualEps(ctrls1X[1], p1x) && gMath.isEqualEps(ctrls1Y[1], p1y)) {
                    aPrev.setProperties(['hrx', 'hry'], [null, null]);
                } else {
                    aPrev.setProperties(['hrx', 'hry'], [ctrls1X[1], ctrls1Y[1]]);
                }

                newAPt = new GXPath.AnchorPoint();
                newAPt.setProperties(['x', 'y', 'tp'], [ctrls1X[3], ctrls1Y[3], tpaNew]);
                this.getAnchorPoints().insertChild(newAPt, aNext);
                if (gMath.isEqualEps(ctrls1X[2], ctrls1X[3]) && gMath.isEqualEps(ctrls1Y[2], ctrls1Y[3])) {
                    newAPt.setProperties(['hlx', 'hly'], [null, null]);
                } else {
                    newAPt.setProperties(['hlx', 'hly'], [ctrls1X[2], ctrls1Y[2]]);
                }
                if (gMath.isEqualEps(ctrls2X[0], ctrls2X[1]) && gMath.isEqualEps(ctrls2Y[0], ctrls2Y[1])) {
                    newAPt.setProperties(['hrx', 'hry'], [null, null]);
                } else {
                    newAPt.setProperties(['hrx', 'hry'], [ctrls2X[1], ctrls2Y[1]]);
                }

                if (gMath.isEqualEps(ctrls2X[2], ctrls2X[3]) && gMath.isEqualEps(ctrls2Y[2], ctrls2Y[3])) {
                    aNext.setProperties(['hlx', 'hly'], [null, null]);
                } else {
                    aNext.setProperties(['hlx', 'hly'], [ctrls2X[2], ctrls2Y[2]]);
                }
            }
            this.endUpdate();
            return newAPt;
        }
    };

    /** @override */
    GXPath.prototype._handleChange = function (change, args) {
        this._handleGeometryChangeForProperties(change, args, GXPath.GeometryProperties);
        this._handleGeometryChangeForProperties(change, args, GXPathBase.GeometryProperties);
        GXPathBase.prototype._handleChange.call(this, change, args);
    };

    /** @override */
    GXPath.prototype.toString = function () {
        return "[GXPath]";
    };

    _.GXPath = GXPath;
})(this);